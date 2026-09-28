/* Importação de fatura de cartão de crédito (PDF) para o Orçamento.
 * Testado com a fatura Ourocard do Banco do Brasil. As compras são distribuídas nas categorias
 * de despesa, e o pagamento da fatura passa a ser tratado como transferência para não contar
 * o mesmo gasto duas vezes (compras detalhadas + "Pagto cartão crédito" do extrato). */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = P.util;
  const I = (P.invoice = {});

  /** Seções da fatura do BB → categoria do app (null = decidir pela descrição). */
  I.SECTIONS = [
    ['pagamentos/creditos', '__payments'],
    ['restaurantes', 'alimentacao'],
    ['supermercados', 'mercado'],
    ['saude', 'saude'],
    ['farmacias', 'saude'],
    ['vestuario', 'compras'],
    ['lojas de departamento', 'compras'],
    ['educacao', 'educacao'],
    ['lazer', 'lazer'],
    ['entretenimento', 'lazer'],
    ['viagens', 'viagem'],
    ['turismo', 'viagem'],
    ['hospedagem', 'viagem'],
    ['transporte', 'transporte'],
    ['combustivel', 'transporte'],
    ['postos', 'transporte'],
    ['telecomunicacoes', 'contas'],
    ['servicos', null],
    ['outros lancamentos', null],
    ['compras parceladas', null],
    ['compras internacionais', null],
  ];

  // ---------------------------------------------------------------------
  // Leitura do PDF (pdf.js, carregado sob demanda)
  // ---------------------------------------------------------------------

  /** Endereços do pdf.js. O Apps Script troca por CDN no build. */
  I.PDFJS_SOURCES = ['vendor/pdf.min.js', 'vendor/pdf.worker.min.js'];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF (' + src + ').'));
      document.head.appendChild(s);
    });
  }

  I.loadPdfJs = async function () {
    if (!g.pdfjsLib) {
      for (const src of I.PDFJS_SOURCES) await loadScript(src);
    }
    // Com pdf.worker carregado como script comum, o pdf.js roda sem Web Worker
    // (necessário para funcionar ao abrir o arquivo direto do disco e no Apps Script).
    return g.pdfjsLib;
  };

  /** Extrai o texto do PDF, uma linha por linha visual. */
  I.extractText = async function (arrayBuffer) {
    const pdfjs = await I.loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const lines = [];
      content.items.forEach((it) => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5];
        let line = lines.find((l) => Math.abs(l.y - y) <= 2);
        if (!line) lines.push((line = { y, items: [] }));
        line.items.push({ x: it.transform[4], s: it.str });
      });
      lines.sort((a, b) => b.y - a.y);
      pages.push(lines.map((l) => l.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')).join('\n'));
    }
    return pages.join('\n');
  };

  // ---------------------------------------------------------------------
  // Interpretação do texto
  // ---------------------------------------------------------------------

  const money = (s) => U.parseNumber(String(s).replace(/\s/g, ''));
  const brDate = (s) => {
    const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
  };

  /** Uma compra "dd/mm" recebe o ano pela data de fechamento da fatura. */
  function inferYear(ddmm, closingISO) {
    const [d, m] = ddmm.split('/').map(Number);
    const cy = Number(closingISO.slice(0, 4));
    const cm = Number(closingISO.slice(5, 7));
    const y = m > cm ? cy - 1 : cy;
    const mk = y + '-' + String(m).padStart(2, '0');
    return mk + '-' + String(Math.min(d, U.daysInMonth(mk))).padStart(2, '0');
  }

  function sectionIn(gapText) {
    const t = U.norm(gapText);
    let best = null;
    let bestPos = -1;
    I.SECTIONS.forEach(([name, cat]) => {
      const pos = t.lastIndexOf(name);
      if (pos > bestPos) {
        bestPos = pos;
        best = { name, cat };
      }
    });
    return best;
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/(^|[\s*])(\S)/g, (m, sp, ch) => sp + ch.toUpperCase());
  }

  /**
   * Interpreta o texto da fatura.
   * @returns {{info: object, rows: Array}}
   */
  I.parseText = function (text) {
    // "PARC 17/21" vira "PARC17de21" para não ser confundido com uma data de compra.
    const flat = String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/PARC\s?(\d{1,2})\/(\d{1,2})/gi, 'PARC$1de$2');
    const nflat = U.norm(flat);
    const info = {
      issuer: /ourocard|banco do brasil|bb\.com\.br/.test(nflat) ? 'Ourocard (BB)' : 'Cartão',
      card: (flat.match(/Final (\d{4})/) || flat.match(/Cart[aã]o (\d{4})/) || [])[1] || '',
      closing: brDate((flat.match(/Fatura fechada em (\d{2}\/\d{2}\/\d{4})/i) || [])[1]),
      due: brDate((flat.match(/Vencimento.{0,120}?(\d{2}\/\d{2}\/\d{4})/i) || [])[1]),
      total: money((flat.match(/Total da Fatura R\$ ?(-?[\d.]+,\d{2})/i) || [])[1] || ''),
      previous: money((flat.match(/Saldo fatura anterior R\$ ?(-?[\d.]+,\d{2})/i) || [])[1] || ''),
    };
    if (!info.closing) {
      const any = flat.match(/(\d{2}\/\d{2}\/\d{4})/);
      info.closing = any ? brDate(any[1]) : U.today();
    }

    const startIdx = flat.search(/Lan[cç]amentos nesta fatura/i);
    const body = startIdx >= 0 ? flat.slice(startIdx) : flat;
    const endIdx = body.search(/Total da Fatura/i);
    const scope = endIdx > 0 ? body.slice(0, endIdx) : body;

    // dd/mm  descrição (sem outra data)  país  R$ valor
    const re = /(?:^|\s)(\d{2}\/\d{2})\s((?:(?!\s\d{2}\/\d{2}\s)(?!R\$).){2,90}?)\s([A-Z]{2})\sR\$\s?(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;
    const rows = [];
    let section = null;
    let last = 0;
    let m;
    const seen = {};
    while ((m = re.exec(scope))) {
      const gap = scope.slice(last, m.index);
      const s = sectionIn(gap);
      if (s) section = s;
      last = re.lastIndex;

      const rawDesc = m[2].replace(/\s+/g, ' ').trim();
      const amountSigned = money(m[4]);
      if (amountSigned === null || amountSigned === 0) continue;
      const parc = rawDesc.match(/PARC(\d{1,2})de(\d{1,2})/i);
      const desc = rawDesc.replace(/\s*(TIT-)?PARC\d{1,2}de\d{1,2}/i, '').replace(/\s*\|\s*/g, ' ').trim();
      const purchaseDate = inferYear(m[1], info.closing);
      const installment = parc ? { n: Number(parc[1]), total: Number(parc[2]) } : null;
      // Parcelas a partir da 2ª pertencem ao mês desta fatura, não ao mês da compra.
      const date = installment && installment.n > 1 ? info.closing : purchaseDate;
      const isPaymentSection = section && section.cat === '__payments';
      let kind = 'purchase';
      if (amountSigned < 0) kind = isPaymentSection && /PGTO|PAGAMENTO|PAGTO/i.test(desc) ? 'payment' : 'credit';
      else if (isPaymentSection) kind = 'credit';

      const category =
        kind === 'purchase'
          ? (section && section.cat && section.cat !== '__payments' ? section.cat : P.statement.guessCategory(desc, false))
          : 'outrasReceitas';
      const baseRef = ['fatura', info.card, info.closing, purchaseDate, U.norm(desc), installment ? installment.n + '-' + installment.total : '', Math.abs(amountSigned).toFixed(2)].join(':');
      seen[baseRef] = (seen[baseRef] || 0) + 1;
      rows.push({
        date,
        purchaseDate,
        title: desc,
        details: '',
        section: section ? section.name : '',
        note: titleCase(desc) + (installment ? ' · parcela ' + installment.n + '/' + installment.total : ''),
        amount: Math.abs(amountSigned),
        income: kind !== 'purchase',
        kind,
        installment,
        category,
        suggested: category,
        investment: false,
        include: kind === 'purchase' || kind === 'credit',
        ref: baseRef + ':' + seen[baseRef],
        tags: [],
      });
    }

    // Estorno/crédito com o mesmo valor de uma cobrança: os dois se anulam.
    rows.filter((r) => r.kind === 'credit').forEach((credit) => {
      const match = rows.find((r) => r.kind === 'purchase' && !r.pairedWith && Math.abs(r.amount - credit.amount) < 0.005);
      if (match) {
        match.pairedWith = credit.ref;
        credit.pairedWith = match.ref;
        match.include = false;
        credit.include = false;
        match.tags.push('estornado');
        credit.tags.push('estorno');
      }
    });
    rows.forEach((r) => {
      if (r.kind === 'payment') r.tags.push('pagamento da fatura');
      if (r.kind === 'credit' && !r.pairedWith) r.note = 'Crédito na fatura · ' + r.note;
    });

    info.purchasesTotal = rows.filter((r) => r.kind === 'purchase').reduce((a, r) => a + r.amount, 0);
    info.creditsTotal = rows.filter((r) => r.kind === 'credit').reduce((a, r) => a + r.amount, 0);
    info.paymentsTotal = rows.filter((r) => r.kind === 'payment').reduce((a, r) => a + r.amount, 0);
    return { info, rows };
  };

  /**
   * Pagamentos de fatura já lançados (vindos do extrato da conta) que representariam
   * os mesmos gastos em dobro. Os que batem com o total desta fatura, com o saldo
   * anterior ou com um pagamento listado nela vêm marcados para remoção.
   */
  I.findCardPayments = function (store, parsed) {
    const targets = [parsed.info.total, parsed.info.previous]
      .concat(parsed.rows.filter((r) => r.kind === 'payment').map((r) => r.amount))
      .filter((v) => v > 0);
    return store.data.transactions
      .filter((t) => t.category === 'cartao' && !(t.ref || '').startsWith('fatura:'))
      .map((t) => ({ tx: t, suggested: targets.some((v) => Math.abs(v - t.amount) < 0.01) }))
      .sort((a, b) => (a.tx.date < b.tx.date ? 1 : -1));
  };

  /** Grava as compras escolhidas e remove os pagamentos de fatura marcados. */
  I.importRows = function (store, rows, removePaymentIds) {
    const remove = new Set(removePaymentIds || []);
    if (remove.size) store.data.transactions = store.data.transactions.filter((t) => !remove.has(t.id));
    store.data.settings.cardItemized = true;
    const res = P.statement.importRows(store, rows.map((r) => Object.assign({}, r, { investment: false })));
    return Object.assign(res, { removed: remove.size });
  };
})(typeof window !== 'undefined' ? window : globalThis);

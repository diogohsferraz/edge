/* Importação de extrato bancário (CSV) para o Orçamento.
 * Testado com o extrato de conta corrente do Banco do Brasil:
 *   "Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"
 * e compatível com extratos genéricos que tenham colunas de data, descrição e valor. */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = P.util;
  const S = (P.statement = {});

  const COLS = {
    date: ['data', 'data lancamento', 'data do lancamento', 'date'],
    title: ['lancamento', 'historico', 'descricao', 'title', 'estabelecimento'],
    details: ['detalhes', 'complemento', 'observacao'],
    doc: ['n documento', 'no documento', 'n° documento', 'documento', 'numero documento', 'identificador'],
    amount: ['valor', 'valor (r$)', 'amount', 'valor r$'],
    type: ['tipo lancamento', 'tipo', 'tipo de lancamento'],
  };

  /** Linhas que não são lançamentos (saldos). */
  const SKIP_BALANCE = /^(saldo( anterior| do dia| atual| final)?|s a l d o|saldo disponivel)$/;

  /** Movimentações entre a conta e investimentos: não são receita nem despesa. */
  const INVESTMENT = /(rende facil|poupanca|aplicacao|resgate|tesouro dir|cdb|lci|lca|fundo|invest|corretora|previdencia|bb acoes|renda fixa|debito automatico invest)/;

  S.isStatement = function (headerRow) {
    const h = headerRow.map(U.norm);
    const has = (list) => h.some((x) => list.includes(x));
    return has(COLS.date) && has(COLS.amount) && has(COLS.title) && !h.includes('ativo') && !h.includes('investimento');
  };

  /** Sugere uma categoria a partir da descrição. */
  S.guessCategory = function (text, income) {
    const t = U.norm(text);
    const rules = income
      ? [
          ['salario', ['proventos', 'salario', 'pagamento de salario', 'folha', 'vencimento', 'remuneracao']],
          ['rendimentos', ['rendimento', 'juros', 'dividendo', 'amortizacao']],
          ['freelance', ['honorario', 'servico prestado']],
        ]
      : [
          ['cartao', ['cartao credito', 'cartao de credito', 'pagto cartao', 'fatura']],
          ['impostos', ['imposto', 'darf', 'iptu', 'ipva', 'tributo', 'receita federal', 'taxa']],
          ['moradia', ['edificio', 'condominio', 'aluguel', 'residencial', 'imobiliaria', 'res ']],
          ['contas', ['energia', 'equatorial', 'neoenergia', 'enel', 'cemig', 'light', 'agua', 'casal', 'sabesp', 'internet', 'claro', 'vivo', 'tim ', 'oi ', 'net ', 'gas ']],
          ['transporte', ['posto', 'combust', 'shell', 'ipiranga', 'uber', '99 ', '99app', 'estacion', 'pedagio', 'sem parar', 'detran']],
          ['compras', ['magazine', 'americanas', 'shopee', 'mercadolivre', 'mercado livre', 'amazon', 'shein', 'renner', 'riachuelo']],
          ['mercado', ['supermerc', 'mercado', 'atacad', 'assai', 'carrefour', 'hortifruti', 'padaria', 'extra ', 'pao de acucar']],
          ['alimentacao', ['restaurante', 'ifood', 'lanche', 'burger', 'pizza', 'bar ', 'cafe']],
          ['saude', ['farmacia', 'drogaria', 'drogasil', 'pague menos', 'hospital', 'clinica', 'laborat', 'unimed', 'hapvida', 'smartfit', 'academia', 'odonto', 'medic']],
          ['educacao', ['escola', 'colegio', 'faculdade', 'curso', 'livraria', 'udemy']],
          ['assinaturas', ['netflix', 'spotify', 'amazon prime', 'disney', 'youtube', 'apple.com', 'google', 'hbo', 'globoplay']],
          ['viagem', ['hotel', 'airbnb', 'latam', 'gol ', 'azul ', 'booking', 'decolar']],
          ['pets', ['pet', 'veterin', 'cobasi', 'petz']],
          ['lazer', ['cinema', 'ingresso', 'show', 'teatro', 'steam', 'playstation']],
        ];
    for (const [cat, keys] of rules) if (keys.some((k) => t.includes(k.trim()) && (k.endsWith(' ') ? (' ' + t + ' ').includes(' ' + k) : true))) return cat;
    return income ? 'outrasReceitas' : 'outrosGastos';
  };

  /** Remove o prefixo "03/09 18:00 " que o BB coloca nos detalhes de Pix e cartão. */
  function cleanDetails(s) {
    return String(s || '').replace(/^\d{2}\/\d{2}(\s+\d{2}:\d{2})?\s+/, '').replace(/\s+/g, ' ').trim();
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/(^|\s)(\S)/g, (m, sp, ch) => sp + ch.toUpperCase());
  }

  /**
   * Lê o extrato e devolve as linhas classificadas.
   * @returns {{rows: Array, skipped: {balance:number, investment:number, invalid:number}}}
   */
  S.parse = function (text) {
    const table = P.csv.parse(text);
    if (table.length < 2) throw new Error('O extrato está vazio.');
    const header = table[0].map(U.norm);
    const idx = {};
    Object.keys(COLS).forEach((k) => {
      const i = header.findIndex((h) => COLS[k].includes(h));
      if (i >= 0) idx[k] = i;
    });
    if (idx.date === undefined || idx.amount === undefined || idx.title === undefined) {
      throw new Error('Não reconheci as colunas do extrato. É preciso ter Data, Lançamento/Descrição e Valor.');
    }
    const cell = (r, k) => (idx[k] !== undefined && idx[k] < r.length ? r[idx[k]] : '');
    const skipped = { balance: 0, investment: 0, invalid: 0 };
    const rows = [];
    table.slice(1).forEach((r, line) => {
      const title = cell(r, 'title').trim();
      const nt = U.norm(title);
      if (SKIP_BALANCE.test(nt)) return skipped.balance++;
      const date = P.csv.parseDate(cell(r, 'date'));
      let amount = U.parseNumber(cell(r, 'amount'));
      if (!date || amount === null || amount === 0) return skipped.invalid++;
      const type = U.norm(cell(r, 'type'));
      if (type === 'saida' && amount > 0) amount = -amount;
      if (type === 'entrada' && amount < 0) amount = -amount;
      const details = cleanDetails(cell(r, 'details'));
      const investment = INVESTMENT.test(nt) || INVESTMENT.test(U.norm(details));
      const income = amount > 0;
      const note = details ? titleCase(title) + ' · ' + titleCase(details) : titleCase(title);
      const doc = cell(r, 'doc').trim();
      rows.push({
        line: line + 2,
        date,
        title,
        details,
        note,
        amount: Math.abs(amount),
        income,
        investment,
        category: S.guessCategory(title + ' ' + details, income),
        ref: 'extrato:' + date + ':' + (doc || line) + ':' + Math.abs(amount).toFixed(2) + ':' + U.norm(title),
        include: !investment,
      });
    });
    rows.forEach((r) => r.investment && skipped.investment++);
    return { rows, skipped };
  };

  /** Chave usada para lembrar a categoria escolhida para um favorecido/descrição. */
  S.ruleKey = function (r) {
    return U.norm(r.details || r.title).replace(/[0-9./-]{6,}/g, '').trim();
  };

  /** Aplica as categorias que o usuário escolheu em importações anteriores. */
  S.applyRules = function (rows, rules) {
    rules = rules || {};
    rows.forEach((r) => {
      const c = rules[S.ruleKey(r)];
      if (c && P.categoryById(c).income === r.income) {
        r.category = c;
        r.remembered = true;
      }
    });
    return rows;
  };

  /** Grava as linhas escolhidas no Orçamento, sem duplicar o que já foi importado. */
  S.importRows = function (store, rows) {
    const rules = (store.data.settings.categoryRules = store.data.settings.categoryRules || {});
    rows.forEach((r) => {
      if (!r.include || r.investment) return;
      const key = S.ruleKey(r);
      const guessed = S.guessCategory(r.title + ' ' + r.details, r.income);
      if (key && r.category !== guessed) rules[key] = r.category;
      else if (key && rules[key] && r.category === guessed) delete rules[key];
    });
    const existing = new Set(store.data.transactions.map((t) => t.ref).filter(Boolean));
    let added = 0, duplicates = 0;
    rows.forEach((r) => {
      if (!r.include) return;
      if (existing.has(r.ref)) return duplicates++;
      const cat = P.categoryById(r.category);
      store.data.transactions.push({ id: U.uid(), date: r.date, amount: r.amount, category: cat.id, income: cat.income, note: r.note, ref: r.ref });
      existing.add(r.ref);
      added++;
    });
    store.commit();
    return { added, duplicates };
  };
})(typeof window !== 'undefined' ? window : globalThis);

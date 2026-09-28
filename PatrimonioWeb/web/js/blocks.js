/*
 * Planilha de evolução patrimonial em blocos: um bloco por fechamento, lado a lado ou empilhados.
 *
 *     06/07/2020
 *     Investimento        | Banco | Valor    | % | Rendimento
 *     Poupança Ouro - 001 | BB    | 93,88    |
 *     LCA POS CDI         | BB    | 47736,65 |
 *     TOTAL               | 104034,21
 *
 * Tabelas auxiliares (resumo de ações, alocação alvo) ficam de fora: só entram blocos cujo
 * cabeçalho tem "Investimento" e "Valor".
 */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = P.util;
  const B = (P.blocks = {});

  B.NOTE = 'Estimado na importação da planilha';

  const NAME_HEADERS = ['investimento', 'investimentos', 'ativo', 'aplicacao', 'produto'];
  const BANK_HEADERS = ['banco', 'instituicao', 'corretora', 'local'];
  const VALUE_HEADERS = ['valor', 'saldo', 'valor atual', 'saldo atual', 'total'];

  /** Data de um cabeçalho de bloco. Aceita dia inválido ("31/09/2020" → 30/09/2020). */
  B.parseDate = function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v > 20000 && v < 80000 && P.xlsx ? P.xlsx.serialToISO(v) : null;
    const s = String(v).trim();
    let m, y, mo, d;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, mo, d] = [+m[1], +m[2], +m[3]];
    else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) [y, mo, d] = [+m[3], +m[2], +m[1]];
    else return P.csv && P.csv.parseMonthHeader(s);
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    const mk = y + '-' + String(mo).padStart(2, '0');
    return mk + '-' + String(Math.min(d, U.daysInMonth(mk))).padStart(2, '0');
  };

  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

  /** Procura os blocos na grade (array de linhas). */
  B.parse = function (rows) {
    const blocks = [];
    rows.forEach((row, r) => {
      (row || []).forEach((cell, c) => {
        if (!NAME_HEADERS.includes(U.norm(cell))) return;
        let bankCol = -1;
        let valueCol = -1;
        for (let k = c + 1; k < Math.min(row.length, c + 6); k++) {
          const h = U.norm(row[k]);
          if (bankCol < 0 && BANK_HEADERS.includes(h)) bankCol = k;
          else if (valueCol < 0 && VALUE_HEADERS.includes(h)) valueCol = k;
        }
        if (valueCol < 0) return;

        // Data: nas linhas logo acima do cabeçalho.
        let date = null;
        for (let rr = r - 1; rr >= Math.max(0, r - 3) && !date; rr--) {
          for (let k = c; k <= valueCol && !date; k++) date = B.parseDate((rows[rr] || [])[k]);
        }
        if (!date) return;

        const items = [];
        let total = null;
        let blanks = 0;
        for (let rr = r + 1; rr < rows.length; rr++) {
          const line = rows[rr] || [];
          const name = text(line[c]);
          if (!name) {
            if (++blanks >= 6) break;
            continue;
          }
          blanks = 0;
          const key = U.norm(name);
          if (key.startsWith('total')) {
            for (let k = c + 1; k <= valueCol && total === null; k++) total = U.parseNumber(line[k]);
            break;
          }
          if (NAME_HEADERS.includes(key) || BANK_HEADERS.includes(key)) break;
          const raw = line[valueCol];
          let value = U.parseNumber(raw);
          if (value === null) {
            const t = text(raw);
            if (/^[-–—]$/.test(t)) value = 0;
            else if (t && !t.startsWith('#')) break; // cabeçalho de outra tabela
            else continue;
          }
          items.push({ name, bank: bankCol >= 0 ? text(line[bankCol]) : '', value });
        }
        if (items.length) blocks.push({ date, total, items, row: r, col: c });
      });
    });
    blocks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.col - b.col));
    // Duas colunas com a mesma data: fica a última.
    return blocks.filter((b, i) => !blocks[i + 1] || blocks[i + 1].date !== b.date);
  };

  B.guessClass = function (name) {
    const raw = text(name);
    const t = U.norm(raw);
    const ticker = raw.toUpperCase().match(/^([A-Z]{4})(\d{1,2})F?$/);
    if (ticker) return Number(ticker[2]) >= 31 && Number(ticker[2]) <= 39 ? 'exterior' : 'acoes';
    if (t === 'caixa' || t.startsWith('saldo')) return 'conta';
    return P.matchClass(raw);
  };

  /**
   * Como estimar aporte/resgate entre dois fechamentos de um ativo (a planilha só tem saldos):
   * - conta corrente e dinheiro parado: toda variação é entrada ou saída de dinheiro;
   * - renda fixa, Tesouro e poupança: variação dentro do que o ativo costuma render é rendimento;
   *   o que passa disso vira aporte ou resgate, descontado um rendimento estimado de 0,8% ao mês;
   * - fundos, previdência e outros: idem, com uma faixa mais larga de oscilação;
 * - ações, FIIs, exterior e cripto: a variação é rendimento (salvo quando a posição abre ou zera).
   */
  function flowMode(classId, name) {
    const t = U.norm(name);
    if (classId === 'conta') return t.includes('poupanca') || t.includes('caixinha') || t.includes('cofrinho') ? 'fixed' : 'cash';
    if (['rendaFixa', 'tesouro'].includes(classId)) return 'fixed';
    if (['fundos', 'previdencia', 'outros'].includes(classId)) return 'mixed';
    return 'market';
  }

  function estimateFlow(mode, classId, prev, value, days) {
    if (prev <= 0) return value;
    if (value <= 0) return -prev;
    const delta = value - prev;
    if (mode === 'cash') return delta;
    if (mode === 'market') return 0;
    const months = Math.max(days, 1) / 30.44;
    const lo = -prev * (mode === 'mixed' ? 0.08 : classId === 'tesouro' ? 0.04 : 0.005);
    const hi = prev * ((mode === 'mixed' ? 0.03 : 0.015) * months + (mode === 'mixed' ? 0.02 : 0.005));
    if (delta >= lo && delta <= hi) return 0;
    return delta - prev * 0.008 * months;
  }

  function findInst(store, name) {
    const insts = store.data.institutions;
    return insts.find((i) => U.norm(i.name) === U.norm(name)) || insts.find((i) => U.norm(i.name) === U.norm(P.institutionAlias(name)));
  }

  const keyOf = (bank, name) => U.norm(bank || 'Sem instituição') + '|' + U.norm(name);

  /** Monta o plano de importação (para a prévia). */
  B.plan = function (store, blocks) {
    const map = {};
    const list = [];
    blocks.forEach((b, bi) => {
      const seen = {};
      b.items.forEach((it) => {
        const k = keyOf(it.bank, it.name);
        let a = map[k];
        if (!a) {
          a = map[k] = { key: k, name: it.name, bank: it.bank || 'Sem instituição', classId: B.guessClass(it.name), values: new Array(blocks.length).fill(null) };
          list.push(a);
        }
        // O mesmo investimento duas vezes no mesmo fechamento: soma.
        a.values[bi] = (seen[k] ? a.values[bi] : 0) + it.value;
        seen[k] = true;
      });
    });
    list.forEach((a) => {
      a.first = a.values.findIndex((v) => v !== null);
      let last = a.values.length - 1;
      while (last >= 0 && a.values[last] === null) last--;
      // Sumiu da planilha: saldo zero no fechamento seguinte.
      a.closedAt = last < blocks.length - 1 ? last + 1 : null;
      a.lastValue = a.closedAt !== null ? 0 : a.values[last];
      const inst = findInst(store, a.bank);
      const existing = inst && store.data.assets.find((x) => x.institutionId === inst.id && U.norm(x.name) === U.norm(a.name));
      a.exists = !!existing;
      if (existing) a.classId = existing.classId;
    });
    const checks = blocks.map((b) => {
      const sum = b.items.reduce((acc, it) => acc + it.value, 0);
      return { date: b.date, sum, total: b.total, ok: b.total === null || Math.abs(sum - b.total) < 0.05 };
    });
    return { blocks, assets: list, checks };
  };

  /** Grava o plano. `opts.estimateFlows` (padrão true); `plan.assets[i].classId` pode ter sido alterado na prévia. */
  B.apply = function (store, plan, opts) {
    opts = opts || {};
    const estimate = opts.estimateFlows !== false;
    const dates = plan.blocks.map((b) => b.date);
    const summary = { institutionsCreated: 0, assetsCreated: 0, balances: 0, movements: 0, skipped: 0 };
    const data = store.data;
    plan.assets.forEach((p) => {
      const r = store.findOrCreateInstitution(p.bank, false);
      if (r.created) summary.institutionsCreated++;
      let asset = data.assets.find((a) => a.institutionId === r.inst.id && U.norm(a.name) === U.norm(p.name));
      if (!asset) {
        const ticker = /^[A-Z]{4}\d{1,2}F?$/.test(p.name.trim().toUpperCase()) ? p.name.trim().toUpperCase() : '';
        asset = store.saveAsset({ name: p.name, classId: p.classId, institutionId: r.inst.id, ticker, indexer: '', maturity: null, notes: '' }, 0, null, false);
        summary.assetsCreated++;
      } else asset.classId = p.classId;
      // Reimportar a mesma planilha não duplica: troca as estimativas anteriores.
      data.movements = data.movements.filter((m) => !(m.assetId === asset.id && m.note === B.NOTE));
      const hasOwnFlows = data.movements.some((m) => m.assetId === asset.id);

      const mode = flowMode(p.classId, p.name);
      let prev = 0;
      let prevDate = null;
      const end = p.closedAt !== null ? p.closedAt : dates.length - 1;
      for (let i = p.first; i <= end; i++) {
        const value = i === p.closedAt ? 0 : p.values[i] === null ? 0 : p.values[i];
        store.recordBalance(asset.id, dates[i], value, false);
        summary.balances++;
        if (!hasOwnFlows) {
          const days = prevDate ? (new Date(dates[i]) - new Date(prevDate)) / 86400000 : 0;
          let flow = prev <= 0 || value <= 0 || estimate ? estimateFlow(mode, p.classId, prev, value, days) : 0;
          flow = Math.round(flow * 100) / 100;
          if (Math.abs(flow) >= 0.01) {
            store.recordMovement(asset.id, flow > 0 ? 'aporte' : 'resgate', Math.abs(flow), dates[i], B.NOTE, false);
            summary.movements++;
          }
        }
        prev = value;
        prevDate = dates[i];
      }
      asset.archived = !(p.lastValue > 0);
    });
    store.commit();
    return summary;
  };
})(typeof window !== 'undefined' ? window : globalThis);

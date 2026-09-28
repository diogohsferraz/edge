/* Carteira de exemplo com 18 meses de histórico. */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = P.util;

  P.loadSampleData = function (store, months) {
    months = months || 18;
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const range = (lo, hi) => lo + (hi - lo) * rnd();
    const today = U.today();
    const nowMk = U.monthKey(today);
    const startMk = U.addMonths(nowMk, -(months - 1));
    const inst = (name) => store.findOrCreateInstitution(name, false).inst.id;
    const nubank = inst('Nubank'), xp = inst('XP Investimentos'), inter = inst('Inter'), btg = inst('BTG Pactual');

    const specs = [
      ['Caixinha Reserva', 'conta', nubank, 8000, 300, 0.0085, 0.0005, '100% CDI', '', 0],
      ['CDB Liquidez Diária', 'rendaFixa', inter, 12000, 0, 0.009, 0.0005, '102% CDI', '', 0],
      ['LCI 95% CDI 2027', 'rendaFixa', xp, 20000, 0, 0.0088, 0.0003, '95% CDI', '', 0],
      ['Tesouro IPCA+ 2035', 'tesouro', xp, 15000, 500, 0.008, 0.012, 'IPCA + 6,5%', '', 0],
      ['Ações - Carteira B3', 'acoes', xp, 18000, 700, 0.009, 0.045, '', 'ITUB4, WEGE3, BBAS3', 0.005],
      ['FIIs', 'fiis', btg, 10000, 400, 0.002, 0.02, '', 'HGLG11, KNRI11, MXRF11', 0.008],
      ['Fundo Multimercado', 'fundos', btg, 9000, 0, 0.008, 0.015, '', '', 0],
      ['Previdência VGBL', 'previdencia', btg, 14000, 250, 0.0085, 0.006, '', '', 0],
      ['Bitcoin', 'cripto', nubank, 3000, 100, 0.02, 0.12, '', 'BTC', 0],
      ['ETF S&P 500', 'exterior', inter, 6000, 200, 0.011, 0.04, '', 'IVVB11', 0],
    ];
    const clampDay = (mk, d) => {
      const iso = mk + '-' + String(Math.min(d, U.daysInMonth(mk))).padStart(2, '0');
      return iso <= today ? iso : null;
    };
    const r2 = (v) => Math.round(v * 100) / 100;

    specs.forEach(([name, cls, instId, initial, monthly, mean, vol, indexer, ticker, dy]) => {
      const asset = store.saveAsset(
        { name, classId: cls, institutionId: instId, ticker, indexer, maturity: name.includes('2027') ? '2027-06-15' : null, notes: '' },
        initial,
        clampDay(startMk, 3) || today,
        false
      );
      let value = initial;
      for (let i = 0; i < months; i++) {
        const mk = U.addMonths(startMk, i);
        value *= 1 + mean + vol * range(-1.6, 1.6);
        if (i > 0 && monthly > 0) {
          const ap = Math.round(monthly * range(0.6, 1.5));
          value += ap;
          const d = clampDay(mk, 6);
          if (d) store.recordMovement(asset.id, 'aporte', ap, d, '', false);
        }
        if (i > 0 && dy > 0) {
          const d = clampDay(mk, 15);
          if (d) store.recordMovement(asset.id, 'provento', r2(value * dy * range(0.7, 1.3)), d, '', false);
        }
        const end = U.monthEnd(mk);
        store.recordBalance(asset.id, end < today ? end : today, r2(value), false);
      }
    });

    const fixed = [['salario', 9500, 5, 'Salário'], ['moradia', 2300, 10, 'Aluguel'], ['contas', 380, 12, 'Luz, água e internet'], ['assinaturas', 89.9, 15, 'Streaming e apps'], ['educacao', 450, 8, 'Curso de inglês']];
    const variable = [['mercado', 180, 650, 'Supermercado'], ['alimentacao', 45, 160, 'Restaurante'], ['transporte', 25, 120, 'Combustível / app'], ['lazer', 40, 250, 'Cinema e passeios'], ['compras', 60, 400, 'Compras'], ['saude', 50, 300, 'Farmácia']];
    const data = store.data;
    const addTx = (date, amount, category, note) => {
      if (!date) return;
      const cat = P.categoryById(category);
      data.transactions.push({ id: U.uid(), date, amount, category, income: cat.income, note });
    };
    for (let back = 0; back < 6; back++) {
      const mk = U.addMonths(nowMk, -back);
      fixed.forEach(([c, v, d, n]) => addTx(clampDay(mk, d), v, c, n));
      if (back % 2 === 0) addTx(clampDay(mk, 21), Math.round(range(600, 1800)), 'freelance', 'Projeto extra');
      for (let k = 0; k < 14; k++) {
        const [c, lo, hi, n] = variable[Math.floor(rnd() * variable.length)];
        addTx(clampDay(mk, 1 + Math.floor(range(0, 27))), r2(range(lo, hi)), c, n);
      }
    }
    store.commit();
  };
})(typeof window !== 'undefined' ? window : globalThis);

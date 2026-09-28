/*
 * "Onde aportar": alocação-alvo por classe, divisão do aporte do mês, projeção do prazo da meta
 * e sugestões de investimentos. Tudo é estimativa educativa, não recomendação de investimento.
 */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = P.util;
  const PL = (P.planner = {});

  /** Alocação-alvo (% por classe) de cada perfil. */
  PL.PROFILES = {
    conservador: { title: 'Conservador', targets: { conta: 10, rendaFixa: 45, tesouro: 25, fiis: 7, acoes: 5, exterior: 8 } },
    moderado: { title: 'Moderado', targets: { conta: 5, rendaFixa: 35, tesouro: 20, fiis: 10, acoes: 15, exterior: 12, cripto: 3 } },
    arrojado: { title: 'Arrojado', targets: { conta: 5, rendaFixa: 20, tesouro: 15, fiis: 15, acoes: 25, exterior: 15, cripto: 5 } },
  };

  /** Rentabilidade anual esperada por classe, a partir do CDI (premissa simples e editável). */
  PL.defaultReturns = function (cdi) {
    const c = cdi > 0 ? cdi : 0.11;
    return {
      conta: c * 0.7,
      rendaFixa: c,
      tesouro: c * 1.02,
      fundos: c,
      previdencia: c * 0.95,
      fiis: c + 0.01,
      acoes: c + 0.03,
      exterior: c + 0.02,
      cripto: c + 0.05,
      outros: c * 0.9,
    };
  };

  /** CDI acumulado dos últimos 12 meses disponíveis (taxa anual), ou null. */
  PL.cdiLast12 = function (benchmarks) {
    const cdi = (benchmarks && benchmarks.cdi) || {};
    const months = Object.keys(cdi).sort().slice(-12);
    if (months.length < 6) return null;
    const acc = months.reduce((a, m) => a * (1 + cdi[m]), 1);
    return Math.pow(acc, 12 / months.length) - 1;
  };

  const monthly = (annual) => Math.pow(1 + annual, 1 / 12) - 1;

  /** Normaliza os alvos (em %) para frações que somam 1. */
  PL.normalizeTargets = function (targets) {
    const out = {};
    let sum = 0;
    Object.keys(targets || {}).forEach((k) => {
      const v = Number(targets[k]) || 0;
      if (v > 0) {
        out[k] = v;
        sum += v;
      }
    });
    if (sum <= 0) return {};
    Object.keys(out).forEach((k) => (out[k] /= sum));
    return out;
  };

  /**
   * Divide `amount` entre as classes para aproximar a carteira do alvo, sem vender nada:
   * primeiro cobre o que falta em cada classe abaixo do alvo; se sobrar, segue os pesos do alvo.
   * values: {classe: R$}; weights: {classe: fração}.
   */
  PL.recommend = function (values, weights, amount) {
    const out = {};
    if (!(amount > 0)) return out;
    const keys = Object.keys(weights).filter((k) => weights[k] > 0);
    if (!keys.length) return out;
    const total = Object.values(values).reduce((a, v) => a + (v > 0 ? v : 0), 0) + amount;
    const deficit = {};
    let D = 0;
    keys.forEach((k) => {
      deficit[k] = Math.max(0, weights[k] * total - (values[k] || 0));
      D += deficit[k];
    });
    keys.forEach((k) => {
      if (D <= 1e-9) out[k] = amount * weights[k];
      else if (D >= amount) out[k] = (amount * deficit[k]) / D;
      else out[k] = deficit[k] + (amount - D) * weights[k];
    });
    return out;
  };

  /**
   * Meses até `goal`. A cada mês a carteira rende (taxa da classe) e recebe o aporte:
   * com `weights`, dividido pela sugestão; sem, na proporção atual da carteira.
   */
  PL.simulate = function (values, amount, returns, goal, weights, max) {
    max = max || 600;
    const v = Object.assign({}, values);
    const rates = {};
    Object.keys(returns).forEach((k) => (rates[k] = monthly(returns[k])));
    const sum = () => Object.values(v).reduce((a, x) => a + x, 0);
    if (sum() >= goal) return 0;
    for (let m = 1; m <= max; m++) {
      Object.keys(v).forEach((k) => (v[k] *= 1 + (rates[k] || 0)));
      if (amount > 0) {
        let split;
        if (weights) split = PL.recommend(v, weights, amount);
        else {
          const t = sum();
          split = {};
          if (t > 0) Object.keys(v).forEach((k) => (split[k] = (amount * v[k]) / t));
          else split.rendaFixa = amount;
        }
        Object.keys(split).forEach((k) => (v[k] = (v[k] || 0) + split[k]));
      }
      if (sum() >= goal) return m;
    }
    return null;
  };

  /** Ideias por classe, para quem ainda não tem nada nela. Exemplos genéricos, não indicação. */
  PL.IDEAS = {
    conta: [{ title: 'Reserva de emergência com liquidez diária', why: 'CDB de liquidez diária, Tesouro Selic ou conta remunerada: 6 a 12 meses de gastos à mão.' }],
    rendaFixa: [
      { title: 'CDB, LCI e LCA acima de 100% do CDI', why: 'Bancos médios pagam mais e o FGC cobre até R$ 250 mil por CPF e instituição. LCI/LCA são isentas de IR.' },
      { title: 'Debêntures incentivadas, CRI e CRA', why: 'Isentos de IR para pessoa física; prazos mais longos e sem FGC, por isso diversifique entre emissores.' },
    ],
    tesouro: [
      { title: 'Tesouro IPCA+', why: 'Protege o poder de compra no longo prazo (inflação + juro real). Bom para a meta de patrimônio.' },
      { title: 'Tesouro Selic', why: 'Liquidez diária e baixo risco: alternativa à poupança e à conta corrente.' },
    ],
    fundos: [{ title: 'Fundos multimercado', why: 'Gestão profissional que combina juros, câmbio e bolsa; compare taxa de administração e histórico.' }],
    previdencia: [{ title: 'Previdência PGBL ou VGBL', why: 'PGBL deduz até 12% da renda tributável para quem faz a declaração completa; prefira fundos de taxa baixa.' }],
    fiis: [{ title: 'Fundos imobiliários (FIIs)', why: 'Renda mensal isenta de IR. Um ETF de FIIs (ex.: XFIX11) ou 5 a 10 FIIs de segmentos diferentes diversificam o risco.' }],
    acoes: [{ title: 'ETF de ações brasileiras', why: 'Um ETF do Ibovespa (ex.: BOVA11) ou de dividendos (ex.: DIVO11) dá diversificação com um único ativo.' }],
    exterior: [{ title: 'ETF de ações globais', why: 'Dolariza parte do patrimônio. Ex.: IVVB11 (S&P 500) na B3, ou ETFs no exterior via corretora internacional.' }],
    cripto: [{ title: 'Pequena parcela em cripto', why: 'Até 5% da carteira, de preferência via ETF de bitcoin na B3 (ex.: HASH11). Volatilidade alta.' }],
    outros: [],
  };

  const FGC_LIMIT = 250000;

  /**
   * Análise completa. `an` é o P.Analytics da carteira inteira; `data` os dados normalizados.
   * Retorna { amount, weights, rows, projection, suggestions, alerts, ... }.
   */
  PL.analyze = function (data, an) {
    const plan = (data.settings && data.settings.plan) || {};
    const profile = plan.profile && (PL.PROFILES[plan.profile] || plan.profile === 'custom') ? plan.profile : 'moderado';
    const rawTargets = profile === 'custom' ? plan.targets || {} : PL.PROFILES[profile].targets;
    const weights = PL.normalizeTargets(rawTargets);
    const cdi = PL.cdiLast12(data.benchmarks);
    const returns = Object.assign(PL.defaultReturns(cdi), plan.returns || {});

    const active = an.assets.filter((a) => !a.archived);
    const values = {};
    active.forEach((a) => (values[a.classId] = (values[a.classId] || 0) + an.valueOf(a, an.today)));
    Object.keys(values).forEach((k) => values[k] <= 0 && delete values[k]);
    const total = Object.values(values).reduce((a, v) => a + v, 0);

    const p12 = an.performance(12);
    const avgNet = p12.length ? p12.reduce((a, p) => a + p.netContribution, 0) / p12.length : 0;
    const suggestedAmount = avgNet > 0 ? Math.round(avgNet / 50) * 50 : 0;
    const amount = plan.monthly > 0 ? plan.monthly : suggestedAmount;
    const split = PL.recommend(values, weights, amount);

    const classIds = P.ASSET_CLASSES.map((c) => c.id).filter((id) => values[id] > 0 || weights[id] > 0);
    const rows = classIds.map((id) => ({
      classId: id,
      value: values[id] || 0,
      share: total > 0 ? (values[id] || 0) / total : 0,
      target: weights[id] || 0,
      aporte: split[id] || 0,
      holdings: active.filter((a) => a.classId === id).sort((x, y) => an.valueOf(y, an.today) - an.valueOf(x, an.today)),
    }));

    const expected = (w) => Object.keys(w).reduce((acc, k) => acc + w[k] * (returns[k] || 0), 0);
    const currentWeights = {};
    Object.keys(values).forEach((k) => (currentWeights[k] = total > 0 ? values[k] / total : 0));

    // Projeção da meta.
    const goal = (data.settings && data.settings.goal) || 0;
    let projection = null;
    if (goal > 0 && total < goal) {
      const keep = PL.simulate(values, amount, returns, goal, null);
      const follow = PL.simulate(values, amount, returns, goal, weights);
      const more = amount > 0 ? PL.simulate(values, amount * 1.25, returns, goal, weights) : null;
      // Dinheiro parado em conta acima da reserva-alvo, aplicado em renda fixa.
      const reserve = (weights.conta || 0) * total;
      const idle = Math.max(0, (values.conta || 0) - Math.max(reserve, 0));
      let idleMonths = null;
      if (idle >= 1000) {
        const moved = Object.assign({}, values);
        moved.conta -= idle;
        moved.rendaFixa = (moved.rendaFixa || 0) + idle;
        idleMonths = PL.simulate(moved, amount, returns, goal, weights);
      }
      projection = { goal, keep, follow, more, moreAmount: amount * 1.25, idle, idleMonths };
    }

    // Sugestões: para cada classe que recebe aporte, reforçar o que já tem ou começar algo novo.
    const suggestions = rows
      .filter((r) => r.aporte >= Math.max(1, amount * 0.02) || (r.target > 0 && !r.holdings.length))
      .sort((a, b) => b.aporte - a.aporte)
      .map((r) => ({
        classId: r.classId,
        aporte: r.aporte,
        existing: r.holdings.slice(0, 3).map((a) => ({ id: a.id, name: a.name, institution: a.institutionName })),
        ideas: r.holdings.length ? [] : PL.IDEAS[r.classId] || [],
      }));
    const missing = P.ASSET_CLASSES.filter((c) => !(values[c.id] > 0) && PL.IDEAS[c.id] && PL.IDEAS[c.id].length && !(weights[c.id] > 0)).map((c) => c.id);

    // Alertas.
    const alerts = [];
    const byInst = {};
    active.forEach((a) => {
      const t = U.norm(a.name);
      const covered = a.classId === 'conta' || (a.classId === 'rendaFixa' && !/debenture|cri\b|cra\b|fundo/.test(t));
      if (!covered) return;
      const k = a.institutionId || '_';
      byInst[k] = byInst[k] || { name: a.institutionName, value: 0 };
      byInst[k].value += an.valueOf(a, an.today);
    });
    Object.values(byInst).forEach((i) => {
      if (i.value > FGC_LIMIT)
        alerts.push({ kind: 'fgc', text: i.name + ' concentra ' + U.money(i.value) + ' em aplicações cobertas pelo FGC, acima do limite de R$ 250 mil por CPF e instituição. Se estiver tudo no mesmo CPF, divida entre instituições ou titulares.' });
    });
    active.forEach((a) => {
      const v = an.valueOf(a, an.today);
      if (total > 0 && v / total > 0.3) alerts.push({ kind: 'concentration', text: a.name + ' representa ' + U.pct(v / total) + ' da carteira. Concentração alta em um único investimento.' });
    });
    if (total > 0 && (values.conta || 0) / total > (weights.conta || 0) + 0.05 && (values.conta || 0) > 1000) {
      alerts.push({ kind: 'idle', text: U.money(values.conta) + ' (' + U.pct(values.conta / total) + ') estão em conta e poupança, acima da reserva do perfil (' + U.pct(weights.conta || 0) + '). Esse dinheiro rende menos que a renda fixa.' });
    }

    return {
      profile,
      profileTitle: profile === 'custom' ? 'Personalizado' : PL.PROFILES[profile].title,
      weights,
      returns,
      cdi,
      total,
      amount,
      suggestedAmount,
      rows,
      expectedNow: expected(currentWeights),
      expectedTarget: expected(weights),
      projection,
      suggestions,
      missing,
      alerts,
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);

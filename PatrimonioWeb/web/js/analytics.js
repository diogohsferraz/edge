/* Cálculos da carteira: evolução, rentabilidade (Modified Dietz), alocação. */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = P.util;

  /**
   * @param {object} data  dados normalizados (P.normalizeData)
   * @param {string} [today] data ISO de referência (padrão: hoje)
   */
  function Analytics(data, today) {
    this.today = today || U.today();
    const instById = {};
    data.institutions.forEach((i) => (instById[i.id] = i));
    const byAsset = {};
    data.assets.forEach((a) => {
      const inst = instById[a.institutionId];
      byAsset[a.id] = {
        id: a.id,
        name: a.name,
        classId: a.classId,
        archived: a.archived,
        institutionId: a.institutionId,
        institutionName: inst ? inst.name : 'Sem instituição',
        institutionColor: inst ? inst.color : '#8E8E93',
        snaps: [],
        flows: [],
      };
    });
    data.snapshots.forEach((s) => byAsset[s.assetId] && byAsset[s.assetId].snaps.push(s));
    data.movements.forEach((m) => byAsset[m.assetId] && byAsset[m.assetId].flows.push(m));
    const cmp = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    this.assets = Object.values(byAsset);
    this.assets.forEach((a) => {
      a.snaps.sort(cmp);
      a.flows.sort(cmp);
    });
  }

  /** Saldo do ativo na data (último saldo informado até ela, inclusive). */
  Analytics.prototype.valueOf = function (asset, iso) {
    let v = 0;
    for (const s of asset.snaps) {
      if (s.date <= iso) v = s.value;
      else break;
    }
    return v;
  };

  Analytics.prototype.total = function (iso) {
    iso = iso || this.today;
    return this.assets.reduce((acc, a) => acc + this.valueOf(a, iso), 0);
  };

  Analytics.prototype.invested = function (iso) {
    iso = iso || this.today;
    let v = 0;
    this.assets.forEach((a) =>
      a.flows.forEach((f) => {
        if (f.date <= iso) v += f.amount * P.kindById(f.kind).investedSign;
      })
    );
    return v;
  };

  Analytics.prototype.proventos = function (fromIso, toIso) {
    fromIso = fromIso || '0000-00-00';
    toIso = toIso || this.today;
    let v = 0;
    this.assets.forEach((a) =>
      a.flows.forEach((f) => {
        if (f.kind === 'provento' && f.date >= fromIso && f.date <= toIso) v += f.amount;
      })
    );
    return v;
  };

  Analytics.prototype.firstDate = function () {
    let first = null;
    this.assets.forEach((a) => {
      a.snaps.concat(a.flows).forEach((x) => {
        if (!first || x.date < first) first = x.date;
      });
    });
    return first;
  };

  /** Meses exibidos: os `limit` últimos (ou todos) desde o primeiro registro. */
  Analytics.prototype.months = function (limit) {
    const first = this.firstDate();
    if (!first) return [];
    const all = U.monthRange(U.monthKey(first), U.monthKey(this.today));
    return limit && all.length > limit ? all.slice(all.length - limit) : all;
  };

  Analytics.prototype.cutoff = function (mk) {
    const end = U.monthEnd(mk);
    return end < this.today ? end : this.today;
  };

  /** Mesma análise restrita a parte da carteira (filtro por classe, instituição ou investimentos). */
  Analytics.prototype.subset = function (pred) {
    const s = Object.create(Analytics.prototype);
    s.today = this.today;
    s.assets = this.assets.filter(pred);
    return s;
  };

  Analytics.prototype.evolution = function (limit) {
    return this.months(limit).map((mk) => {
      const cut = this.cutoff(mk);
      const byClass = {};
      const byInst = {};
      const byAsset = {};
      let total = 0;
      this.assets.forEach((a) => {
        const v = this.valueOf(a, cut);
        total += v;
        byClass[a.classId] = (byClass[a.classId] || 0) + v;
        const ik = a.institutionId || '_';
        byInst[ik] = (byInst[ik] || 0) + v;
        byAsset[a.id] = v;
      });
      return { month: mk, total, invested: this.invested(cut), byClass, byInst, byAsset };
    });
  };

  Analytics.prototype.performanceFor = function (mk) {
    const start = U.monthStart(mk);
    const prevEnd = U.monthEnd(U.addMonths(mk, -1));
    const cut = this.cutoff(mk);
    const startValue = this.total(prevEnd);
    const endValue = this.total(cut);
    const dim = U.daysInMonth(mk);
    let aportes = 0, resgates = 0, proventos = 0, netFlow = 0, weighted = 0;
    this.assets.forEach((a) =>
      a.flows.forEach((f) => {
        if (f.date < start || f.date > U.monthEnd(mk)) return;
        if (f.kind === 'aporte') aportes += f.amount;
        else if (f.kind === 'resgate') resgates += f.amount;
        else proventos += f.amount;
        const signed = f.amount * P.kindById(f.kind).flowSign;
        netFlow += signed;
        const day = Number(f.date.slice(8, 10));
        // Fração do mês em que o dinheiro ficou aplicado.
        const w = Math.max(0, Math.min(1, (dim - day + 0.5) / dim));
        weighted += signed * w;
      })
    );
    const gain = endValue - startValue - netFlow;
    const base = startValue + weighted;
    return {
      month: mk,
      startValue,
      endValue,
      aportes,
      resgates,
      proventos,
      netContribution: aportes - resgates,
      gain,
      rate: base > 0.01 ? gain / base : null,
    };
  };

  Analytics.prototype.performance = function (limit) {
    return this.months(limit).map((mk) => this.performanceFor(mk));
  };

  /** Rentabilidade acumulada (composta). `rates`: [{month, rate}] */
  Analytics.cumulative = function (rates) {
    let acc = 1;
    const out = [];
    rates.forEach((r) => {
      if (r.rate === null || r.rate === undefined) return;
      acc *= 1 + r.rate;
      out.push({ month: r.month, value: acc - 1 });
    });
    return out;
  };

  function slices(map) {
    const list = Object.values(map).filter((s) => s.value > 0.004);
    const total = list.reduce((acc, s) => acc + s.value, 0);
    if (!total) return [];
    return list.map((s) => Object.assign(s, { share: s.value / total })).sort((a, b) => b.value - a.value);
  }

  Analytics.prototype.allocationByClass = function (iso) {
    iso = iso || this.today;
    const map = {};
    this.assets.forEach((a) => {
      const c = P.classById(a.classId);
      map[c.id] = map[c.id] || { key: c.id, label: c.title, color: c.color, value: 0 };
      map[c.id].value += this.valueOf(a, iso);
    });
    return slices(map);
  };

  Analytics.prototype.allocationByInstitution = function (iso) {
    iso = iso || this.today;
    const map = {};
    this.assets.forEach((a) => {
      const k = a.institutionId || '_';
      map[k] = map[k] || { key: k, label: a.institutionName, color: a.institutionColor, value: 0 };
      map[k].value += this.valueOf(a, iso);
    });
    return slices(map);
  };

  /** Meses estimados para atingir a meta. */
  Analytics.monthsToReach = function (goal, current, monthly, rate, max) {
    max = max || 600;
    if (current >= goal) return 0;
    let v = current;
    for (let m = 1; m <= max; m++) {
      v = v * (1 + rate) + monthly;
      if (v >= goal) return m;
    }
    return null;
  };

  P.Analytics = Analytics;
})(typeof window !== 'undefined' ? window : globalThis);

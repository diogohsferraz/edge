/* Gráficos (Chart.js) com cores que seguem o tema claro/escuro. */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = P.util;
  const C = (P.charts = {});
  const registry = [];

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  C.theme = () => ({
    text: css('--text-2'),
    grid: css('--border'),
    accent: css('--accent'),
    accentSoft: css('--accent-soft'),
    green: css('--green'),
    red: css('--red'),
    orange: css('--orange'),
    muted: css('--text-3'),
    surface: css('--surface'),
  });

  C.destroyAll = function () {
    while (registry.length) {
      try {
        registry.pop().destroy();
      } catch (e) {
        /* ignora */
      }
    }
  };

  function make(canvas, config) {
    if (!canvas || !g.Chart) return null;
    const chart = new g.Chart(canvas.getContext('2d'), config);
    registry.push(chart);
    return chart;
  }

  function base(hidden, t, yFormatter) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ' ' + ctx.dataset.label + ': ' + (hidden ? U.MASK : yFormatter(ctx.parsed.y)),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: t.text, maxRotation: 0, autoSkipPadding: 12 } },
        y: {
          grid: { color: t.grid },
          border: { display: false },
          ticks: {
            color: t.text,
            callback: (v) => {
              if (yFormatter !== U.money) return yFormatter(v);
              return hidden ? '' : U.compact(v);
            },
          },
        },
      },
    };
  }

  const pctTick = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR') + '%';
  C.pctTick = pctTick;

  C.evolution = function (canvas, points, hidden) {
    const t = C.theme();
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 260);
    grad.addColorStop(0, t.accentSoft);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    return make(canvas, {
      type: 'line',
      data: {
        labels: points.map((p) => U.fmtMonth(p.month)),
        datasets: [
          { label: 'Patrimônio', data: points.map((p) => p.total), borderColor: t.accent, backgroundColor: grad, fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4 },
          { label: 'Valor investido', data: points.map((p) => p.invested), borderColor: t.muted, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, stepped: 'after', fill: false },
        ],
      },
      options: base(hidden, t, U.money),
    });
  };

  /** Áreas empilhadas. groups: [{id, title, color}]; key: 'byClass' | 'byInst' | 'byAsset'. */
  C.stacked = function (canvas, points, classes, hidden, key) {
    const t = C.theme();
    key = key || 'byClass';
    const opts = base(hidden, t, U.money);
    opts.scales.y.stacked = true;
    opts.plugins.legend = { display: true, position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } };
    return make(canvas, {
      type: 'line',
      data: {
        labels: points.map((p) => U.fmtMonth(p.month)),
        datasets: classes.map((c) => ({
          label: c.title,
          data: points.map((p) => (c.ids ? c.ids.reduce((acc, id) => acc + (p[key][id] || 0), 0) : p[key][c.id] || 0)),
          borderColor: c.color,
          backgroundColor: c.color + 'CC',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1,
        })),
      },
      options: opts,
    });
  };

  /** Esmaece uma cor "#RRGGBB" (itens não selecionados). */
  const dim = (hex) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex + '40' : hex);
  const pointer = (evt, els) => {
    if (evt.native && evt.native.target) evt.native.target.style.cursor = els.length ? 'pointer' : 'default';
  };

  /** opts: { selected: key, onClick(slice) } */
  C.donut = function (canvas, slices, hidden, opts) {
    const t = C.theme();
    opts = opts || {};
    const colors = slices.map((s) => (opts.selected && s.key !== opts.selected ? dim(s.color) : s.color));
    return make(canvas, {
      type: 'doughnut',
      data: {
        labels: slices.map((s) => s.label),
        datasets: [{ data: slices.map((s) => s.value), backgroundColor: colors, borderColor: t.surface, borderWidth: 2, hoverOffset: 6, offset: slices.map((s) => (opts.selected && s.key === opts.selected ? 10 : 0)) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        onClick: opts.onClick ? (evt, els) => els.length && opts.onClick(slices[els[0].index]) : undefined,
        onHover: opts.onClick ? pointer : undefined,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ' ' + ctx.label + ': ' + (hidden ? U.MASK : U.money(ctx.parsed)) + ' (' + U.pct(slices[ctx.dataIndex].share) + ')' } },
        },
      },
    });
  };

  C.returnBars = function (canvas, perf) {
    const t = C.theme();
    const opts = base(false, t, pctTick);
    opts.plugins.tooltip.callbacks.label = (ctx) => ' Rentabilidade: ' + pctTick(ctx.parsed.y);
    return make(canvas, {
      type: 'bar',
      data: {
        labels: perf.map((p) => U.fmtMonth(p.month)),
        datasets: [{ label: 'Rentabilidade', data: perf.map((p) => (p.rate || 0) * 100), backgroundColor: perf.map((p) => ((p.rate || 0) >= 0 ? t.green : t.red)), borderRadius: 4 }],
      },
      options: opts,
    });
  };

  C.cumulative = function (canvas, series) {
    const t = C.theme();
    const colors = { Carteira: t.accent, CDI: t.orange, IPCA: t.muted };
    const months = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.month)))).sort();
    const opts = base(false, t, pctTick);
    opts.plugins.legend = { display: true, position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } };
    return make(canvas, {
      type: 'line',
      data: {
        labels: months.map(U.fmtMonth),
        datasets: series.map((s) => {
          const byMonth = {};
          s.points.forEach((p) => (byMonth[p.month] = p.value * 100));
          return {
            label: s.name,
            data: months.map((m) => (m in byMonth ? byMonth[m] : null)),
            borderColor: colors[s.name] || t.accent,
            backgroundColor: colors[s.name] || t.accent,
            borderWidth: s.name === 'Carteira' ? 2.5 : 1.5,
            tension: 0.3,
            pointRadius: 0,
            spanGaps: true,
          };
        }),
      },
      options: opts,
    });
  };

  C.flows = function (canvas, perf, hidden) {
    const t = C.theme();
    const opts = base(hidden, t, U.money);
    opts.scales.x.stacked = true;
    opts.plugins.legend = { display: true, position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } };
    return make(canvas, {
      type: 'bar',
      data: {
        labels: perf.map((p) => U.fmtMonth(p.month)),
        datasets: [
          { label: 'Aportes', data: perf.map((p) => p.aportes), backgroundColor: t.green, borderRadius: 3, stack: 'a' },
          { label: 'Resgates', data: perf.map((p) => -p.resgates), backgroundColor: t.red, borderRadius: 3, stack: 'a' },
          { label: 'Proventos', data: perf.map((p) => p.proventos), backgroundColor: t.orange, borderRadius: 3, stack: 'p' },
        ],
      },
      options: opts,
    });
  };

  /**
   * Várias linhas lado a lado (investimentos "separados").
   * series: [{label, color, data: [valor|null por rótulo]}]; percent: valores em fração (0,05 = 5%).
   */
  C.lines = function (canvas, labels, series, hidden, percent) {
    const t = C.theme();
    const fmt = percent ? pctTick : U.money;
    const opts = base(percent ? false : hidden, t, fmt);
    opts.scales.y.beginAtZero = false;
    opts.plugins.legend = { display: true, position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } };
    return make(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: series.map((s) => ({
          label: s.label,
          data: s.data.map((v) => (v === null || v === undefined ? null : percent ? v * 100 : v)),
          borderColor: s.color,
          backgroundColor: s.color,
          borderWidth: s.width || 2,
          borderDash: s.dash,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          spanGaps: true,
        })),
      },
      options: opts,
    });
  };

  /**
   * Barras horizontais. rows: [{key, label, color, values: [..por dataset]}];
   * opts: { datasets: [{label, color?}], percent, selected, onClick(row) }.
   */
  C.hbars = function (canvas, rows, hidden, opts) {
    const t = C.theme();
    opts = opts || {};
    const fmt = opts.percent ? (v) => pctTick(v) : U.money;
    const datasets = (opts.datasets || [{ label: 'Valor' }]).map((d, i) => ({
      label: d.label,
      data: rows.map((r) => (opts.percent ? r.values[i] * 100 : r.values[i])),
      backgroundColor: rows.map((r) => {
        const c = d.color || (typeof r.color === 'function' ? r.color(r.values[i]) : r.color);
        return opts.selected && r.key !== opts.selected ? dim(c) : c;
      }),
      borderRadius: 4,
      barPercentage: 0.8,
      categoryPercentage: 0.8,
    }));
    const hideValues = hidden && !opts.percent;
    return make(canvas, {
      type: 'bar',
      data: { labels: rows.map((r) => r.label), datasets },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: 'nearest', axis: 'y', intersect: false },
        onClick: opts.onClick ? (evt, els) => els.length && opts.onClick(rows[els[0].index]) : undefined,
        onHover: opts.onClick ? pointer : undefined,
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
          tooltip: { callbacks: { label: (ctx) => ' ' + ctx.dataset.label + ': ' + (hideValues ? U.MASK : fmt(ctx.parsed.x)) } },
        },
        scales: {
          x: { grid: { color: t.grid }, border: { display: false }, ticks: { color: t.text, callback: (v) => (opts.percent ? pctTick(v) : hideValues ? '' : U.compact(v)) } },
          y: { grid: { display: false }, ticks: { color: t.text, autoSkip: false } },
        },
      },
    });
  };

  C.assetHistory = function (canvas, snaps, color, hidden) {
    const t = C.theme();
    const opts = base(hidden, t, U.money);
    opts.scales.y.beginAtZero = false;
    return make(canvas, {
      type: 'line',
      data: {
        labels: snaps.map((s) => U.fmtDate(s.date)),
        datasets: [{ label: 'Saldo', data: snaps.map((s) => s.value), borderColor: color, backgroundColor: color + '22', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }],
      },
      options: opts,
    });
  };

  /**
   * Barras mensais de receitas/despesas.
   * opts: { current: 'AAAA-MM', series: [{key, label, color, values}], onClick(month, seriesKey) }
   */
  C.cashBars = function (canvas, months, hidden, opts) {
    const t = C.theme();
    opts = opts || {};
    const series = opts.series || [
      { key: 'income', label: 'Receitas', color: t.green, values: months.map((m) => m.income) },
      { key: 'expense', label: 'Despesas', color: t.red, values: months.map((m) => m.expense) },
    ];
    const opt = base(hidden, t, U.money);
    opt.plugins.legend = { display: series.length > 1, position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } };
    if (opts.onClick) {
      opt.onClick = (evt, els) => {
        // Clique na barra: mês + série. Clique no espaço do mês: só o mês.
        if (els.length) return opts.onClick(months[els[0].index].month, series[els[0].datasetIndex].key);
        const x = evt.chart.scales.x.getValueForPixel(evt.x);
        if (x !== undefined && months[Math.round(x)]) opts.onClick(months[Math.round(x)].month, null);
      };
      opt.onHover = pointer;
    }
    opt.interaction = { mode: 'nearest', intersect: true };
    return make(canvas, {
      type: 'bar',
      data: {
        labels: months.map((m) => U.fmtMonth(m.month)),
        datasets: series.map((s) => ({
          label: s.label,
          data: s.values,
          backgroundColor: months.map((m) => (opts.current && m.month !== opts.current ? dim(s.color) : s.color)),
          borderRadius: 4,
        })),
      },
      options: opt,
    });
  };

  /** Barras por dia do mês. opts: { selected: 'AAAA-MM-DD', color, onClick(day) } */
  C.dailyBars = function (canvas, days, hidden, opts) {
    const t = C.theme();
    opts = opts || {};
    const color = opts.color || t.accent;
    const opt = base(hidden, t, U.money);
    opt.interaction = { mode: 'nearest', intersect: true };
    opt.scales.x.ticks.maxTicksLimit = 10;
    if (opts.onClick) {
      opt.onClick = (evt, els) => els.length && opts.onClick(days[els[0].index].day);
      opt.onHover = pointer;
    }
    return make(canvas, {
      type: 'bar',
      data: {
        labels: days.map((d) => d.day.slice(8, 10)),
        datasets: [{ label: opts.label || 'Total', data: days.map((d) => d.value), backgroundColor: days.map((d) => (opts.selected && d.day !== opts.selected ? dim(color) : color)), borderRadius: 3 }],
      },
      options: opt,
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);

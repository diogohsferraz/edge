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

  C.stacked = function (canvas, points, classes, hidden) {
    const t = C.theme();
    const opts = base(hidden, t, U.money);
    opts.scales.y.stacked = true;
    opts.plugins.legend = { display: true, position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } };
    return make(canvas, {
      type: 'line',
      data: {
        labels: points.map((p) => U.fmtMonth(p.month)),
        datasets: classes.map((c) => ({
          label: c.title,
          data: points.map((p) => p.byClass[c.id] || 0),
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

  C.donut = function (canvas, slices, hidden) {
    const t = C.theme();
    return make(canvas, {
      type: 'doughnut',
      data: {
        labels: slices.map((s) => s.label),
        datasets: [{ data: slices.map((s) => s.value), backgroundColor: slices.map((s) => s.color), borderColor: t.surface, borderWidth: 2, hoverOffset: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
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

  C.cashBars = function (canvas, months, hidden) {
    const t = C.theme();
    const opts = base(hidden, t, U.money);
    opts.plugins.legend = { display: true, position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } };
    return make(canvas, {
      type: 'bar',
      data: {
        labels: months.map((m) => U.fmtMonth(m.month)),
        datasets: [
          { label: 'Receitas', data: months.map((m) => m.income), backgroundColor: t.green, borderRadius: 4 },
          { label: 'Despesas', data: months.map((m) => m.expense), backgroundColor: t.red, borderRadius: 4 },
        ],
      },
      options: opts,
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);

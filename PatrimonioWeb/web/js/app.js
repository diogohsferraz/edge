/* Interface do Patrimônio (web / Windows / Apps Script). */
(function (g) {
  'use strict';
  const P = g.Patrimonio;
  const U = P.util;
  const C = P.charts;
  const esc = U.escape;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = {
    view: 'dashboard',
    assetId: null,
    evoPeriod: 12,
    evoMode: 'total',
    allocMode: 'class',
    perfPeriod: 12,
    group: 'institution',
    showArchived: false,
    search: '',
    cashMonth: U.monthKey(U.today()),
    cashType: 'all',
    cashCategory: null,
    cashDay: null,
    updateDate: U.today(),
    entries: {},
    benchError: null,
    benchLoading: false,
  };
  let store;
  let renderQueued = false;

  const TITLES = { dashboard: 'Patrimônio', portfolio: 'Carteira', asset: 'Investimento', update: 'Atualizar saldos', cashflow: 'Orçamento', settings: 'Ajustes' };
  const PERIODS = [[6, '6M'], [12, '1A'], [24, '2A'], [60, '5A'], [0, 'Tudo']];

  const hidden = () => !!store.data.settings.hideValues;
  const money = (v) => U.money(v, hidden());
  const signed = (v) => U.signedMoney(v, hidden());
  const cls = (v) => (v >= 0 ? 'pos' : 'neg');
  const instOf = (asset) => store.institution(asset.institutionId);
  const instName = (asset) => (instOf(asset) || { name: 'Sem instituição' }).name;
  const initials = (name) =>
    (String(name).split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ]/.test(w)).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();

  function badge(name, color, round) {
    return '<span class="badge' + (round ? ' round' : '') + '" style="background:' + esc(color) + '">' + esc(initials(name)) + '</span>';
  }
  function seg(name, options, current) {
    return (
      '<div class="seg" role="group">' +
      options.map(([v, label]) => '<button type="button" data-seg="' + name + '" data-val="' + esc(v) + '" class="' + (String(v) === String(current) ? 'on' : '') + '">' + esc(label) + '</button>').join('') +
      '</div>'
    );
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // =====================================================================
  // Inicialização
  // =====================================================================

  function init() {
    const backend = P.detectBackend();
    store = P.createStore(backend);
    $('#storage-label').textContent = 'Dados: ' + backend.label;
    store.onChange((data, status, statusOnly) => {
      renderStatus(status);
      if (!statusOnly) queueRender();
    });

    $$('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    $('#toggle-hide').addEventListener('click', () => store.setSetting('hideValues', !hidden()));
    document.addEventListener('click', onGlobalClick);
    // No Windows o próprio app grava antes de fechar; no navegador, avisa se há gravação pendente.
    if (backend.id !== 'desktop') {
      g.addEventListener('beforeunload', (e) => {
        if (store.status === 'pending' || store.status === 'saving') {
          store.flush();
          e.preventDefault();
          e.returnValue = '';
        }
      });
    }

    store
      .load()
      .then(() => {
        render();
        refreshBenchmarks(false);
      })
      .catch((err) => {
        console.error(err);
        $('#view').innerHTML = '<div class="card"><h2>Não foi possível carregar os dados</h2><p class="muted">' + esc(err && err.message ? err.message : err) + '</p></div>';
      });
  }

  function renderStatus(status) {
    const el = $('#save-status');
    const map = { pending: 'Alterações pendentes…', saving: 'Salvando…', saved: 'Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), error: 'Erro ao salvar — tente novamente', idle: '' };
    el.textContent = map[status] || '';
    el.classList.toggle('error', status === 'error');
  }

  function go(view, assetId) {
    state.view = view;
    state.assetId = assetId || null;
    render();
    g.scrollTo && g.scrollTo(0, 0);
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function render() {
    C.destroyAll();
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view || (state.view === 'asset' && b.dataset.view === 'portfolio')));
    $('#toggle-hide').classList.toggle('on', hidden());
    $('#page-title').textContent = TITLES[state.view] || 'Patrimônio';
    const view = $('#view');
    const renderers = { dashboard: renderDashboard, portfolio: renderPortfolio, asset: renderAsset, update: renderUpdate, cashflow: renderCashflow, settings: renderSettings };
    (renderers[state.view] || renderDashboard)(view);
  }

  function onGlobalClick(e) {
    const segBtn = e.target.closest('[data-seg]');
    if (segBtn) {
      const key = segBtn.dataset.seg;
      const raw = segBtn.dataset.val;
      const value = /^\d+$/.test(raw) ? Number(raw) : raw;
      if (key.startsWith('cash')) return setCashFilter({ [key]: value });
      state[key] = value;
      render();
      return;
    }
    const act = e.target.closest('[data-action]');
    if (act && ACTIONS[act.dataset.action]) {
      e.preventDefault();
      ACTIONS[act.dataset.action](act.dataset.id, act);
    }
  }

  const ACTIONS = {
    go: (view) => go(view),
    'open-asset': (id) => go('asset', id),
    'new-asset': () => openAssetForm(null),
    'edit-asset': (id) => openAssetForm(store.asset(id)),
    'quick-update': (id) => openQuickUpdate(store.asset(id)),
    'toggle-archive': (id) => {
      const a = store.asset(id);
      a.archived = !a.archived;
      store.commit();
      toast(a.archived ? 'Investimento arquivado.' : 'Investimento reativado.');
    },
    'delete-asset': async (id) => {
      const a = store.asset(id);
      const ok = await confirmDialog('Excluir "' + a.name + '"?', 'Todo o histórico de saldos e movimentações será apagado. Se você resgatou o investimento, prefira arquivá-lo para manter o histórico nos gráficos.', 'Excluir', true);
      if (!ok) return;
      state.view = 'portfolio';
      store.deleteAsset(id);
      toast('Investimento excluído.');
    },
    'delete-snapshot': (id) => store.deleteSnapshot(id),
    'delete-movement': (id) => store.deleteMovement(id),
    'new-institution': () => openInstitutionForm(null),
    'edit-institution': (id) => openInstitutionForm(store.institution(id)),
    'delete-institution': async (id) => {
      const inst = store.institution(id);
      const n = store.data.assets.filter((a) => a.institutionId === id).length;
      const ok = await confirmDialog('Excluir ' + inst.name + '?', n ? 'Os ' + n + ' investimento(s) desta instituição e seus históricos também serão apagados.' : 'A instituição será removida.', 'Excluir', true);
      if (ok) store.deleteInstitution(id);
    },
    'new-expense': () => openTransactionForm(null, false),
    'new-income': () => openTransactionForm(null, true),
    'edit-tx': (id) => {
      const t = store.data.transactions.find((x) => x.id === id);
      openTransactionForm(t, t.income);
    },
    'manage-categories': () => {
      go('settings');
      const el = document.getElementById('categories');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'new-category': (type) => openCategoryForm(null, { income: type === 'income' }),
    'new-subcategory': (parentId) => openCategoryForm(null, { income: P.categoryById(parentId).income, parentId }),
    'edit-category': (id) => openCategoryForm(P.categoryById(id)),
    'delete-category': (id) => confirmDeleteCategory(P.categoryById(id)),
    'cash-filter': (json) => setCashFilter(JSON.parse(json)),
    'cash-cat': (id) => setCashFilter({ cashCategory: state.cashCategory === id ? P.categoryById(id).parentId || null : id, cashDay: state.cashDay }),
    'cash-day': (day) => setCashFilter({ cashDay: state.cashDay === day ? null : day }),
    'cash-prev': () => setCashFilter({ cashMonth: U.addMonths(state.cashMonth, -1), cashDay: null }),
    'cash-next': () => setCashFilter({ cashMonth: U.addMonths(state.cashMonth, 1), cashDay: null }),
    sample: async () => {
      if (store.data.assets.length) {
        const ok = await confirmDialog('Carregar dados de exemplo?', 'Investimentos e lançamentos fictícios serão adicionados aos seus dados atuais.', 'Carregar');
        if (!ok) return;
      }
      P.loadSampleData(store);
      state.view = 'dashboard';
      toast('Dados de exemplo carregados.');
    },
    'refresh-bench': () => refreshBenchmarks(true),
    'open-data-folder': () => g.desktopAPI && g.desktopAPI.openDataFolder(),
    'import-csv': () => pickFile('.csv,.txt,.tsv,text/csv', importCSV),
    'import-statement': () => pickFile('.csv,.txt,text/csv', openStatementPreview),
    'import-invoice': () => pickPdf(openInvoicePreview),
    'import-json': () => pickFile('.json,application/json', importJSON),
    'export-csv': () => exportFile('patrimonio.csv', P.csv.exportPortfolio(store)),
    'export-tx': () => exportFile('orcamento.csv', P.csv.exportTransactions(store)),
    'export-json': () => exportFile('patrimonio-backup-' + U.today() + '.json', JSON.stringify(store.data, null, 1)),
    'csv-help': () => openCsvHelp(),
    'download-template': (which) => exportFile('modelo-' + which + '.csv', which === 'meses' ? P.csv.TEMPLATE_MONTHS : P.csv.TEMPLATE_ROWS),
    wipe: async () => {
      const ok = await confirmDialog('Apagar todos os dados?', 'Instituições, investimentos, históricos e lançamentos serão apagados. Exporte um backup antes se quiser guardar uma cópia.', 'Apagar tudo', true);
      if (ok) {
        store.wipe();
        state.view = 'dashboard';
        toast('Dados apagados.');
      }
    },
    'save-goal': () => {
      const v = U.parseNumber($('#goal-input').value);
      store.setSetting('goal', v && v > 0 ? v : 0);
      toast(v > 0 ? 'Meta salva.' : 'Meta removida.');
    },
    'fill-last': (id) => {
      const input = $('input[data-balance="' + id + '"]');
      input.value = U.editable(store.currentValue(id));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    'save-update': () => saveUpdate(),
    'clear-update': () => {
      state.entries = {};
      render();
    },
  };

  // =====================================================================
  // Início (dashboard)
  // =====================================================================

  function renderDashboard(view) {
    const data = store.data;
    if (!data.assets.length) {
      view.innerHTML =
        '<div class="card empty">' +
        '<svg viewBox="0 0 24 24" width="64" height="64" style="color:var(--accent)"><path d="M11 2v10h10A10 10 0 0 0 11 2zm-2 2.1A10 10 0 1 0 19.9 15H9z"/></svg>' +
        '<h2>Todo o seu patrimônio em um só lugar</h2>' +
        '<p>Cadastre seus investimentos de todos os bancos e corretoras, atualize os saldos uma vez por mês e acompanhe a evolução com gráficos.</p>' +
        '<div class="actions">' +
        '<button class="btn primary" data-action="new-asset">+ Adicionar investimento</button>' +
        '<button class="btn" data-action="go" data-id="settings">Importar minha planilha</button>' +
        '<button class="btn ghost" data-action="sample">Explorar com dados de exemplo</button>' +
        '</div></div>';
      return;
    }

    const an = new P.Analytics(data);
    const today = an.today;
    const total = an.total();
    const invested = an.invested();
    const totalGain = total - invested + an.proventos();
    const month = an.performanceFor(U.monthKey(today));
    const year = today.slice(0, 4);
    const ytd = an.performance().filter((p) => p.month.startsWith(year));
    const ytdRate = ytd.reduce((acc, p) => (p.rate === null ? acc : acc * (1 + p.rate)), 1) - 1;
    const goal = data.settings.goal || 0;

    let html = '<div class="grid">';

    // ---- Resumo
    html +=
      '<section class="card ' + (goal > 0 ? 'span-8' : 'span-12') + '">' +
      '<div class="kpi-label">Patrimônio total</div>' +
      '<div class="kpi-value num">' + money(total) + '</div>' +
      '<div class="' + cls(month.gain) + ' num">' + signed(month.gain) + (month.rate !== null ? ' (' + U.pct(month.rate, true) + ')' : '') + ' <span class="muted">no mês</span></div>' +
      '<div class="kpi-row">' +
      kpi('Valor investido', money(invested)) +
      kpi('Ganho total', '<span class="' + cls(totalGain) + '">' + signed(totalGain) + '</span>') +
      kpi('Rentabilidade no ano', '<span class="' + cls(ytdRate) + '">' + U.pct(ytdRate, true) + '</span>') +
      kpi('Investimentos', String(data.assets.filter((a) => !a.archived).length)) +
      kpi('Instituições', String(new Set(data.assets.filter((a) => !a.archived).map((a) => a.institutionId)).size)) +
      '</div></section>';

    // ---- Meta
    if (goal > 0) {
      const last12 = an.performance(12);
      const avgContribution = last12.length ? last12.reduce((a, p) => a + p.netContribution, 0) / last12.length : 0;
      const rates = last12.map((p) => p.rate).filter((r) => r !== null);
      const avgRate = rates.length ? Math.max(rates.reduce((a, b) => a + b, 0) / rates.length, 0) : 0;
      const months = P.Analytics.monthsToReach(goal, total, Math.max(avgContribution, 0), avgRate);
      const progress = Math.max(0, Math.min(1, total / goal));
      html +=
        '<section class="card span-4">' +
        '<div class="card-head"><div><h3 class="card-title">Meta de patrimônio</h3><div class="card-sub">' + money(goal) + '</div></div><strong style="color:var(--accent)">' + U.pct(progress) + '</strong></div>' +
        '<div class="progress"><span style="width:' + (progress * 100).toFixed(1) + '%"></span></div>' +
        (progress >= 1
          ? '<p class="pos">Meta atingida! 🎉</p>'
          : '<p>Faltam <strong class="num">' + money(goal - total) + '</strong>' + (months !== null ? '<br><span class="muted">Estimativa: ' + describeMonths(months) + '</span>' : '') + '</p>' +
            '<div class="faint">Com base na média de aportes e rentabilidade dos últimos 12 meses.</div>') +
        '</section>';
    }

    // ---- Evolução
    const points = an.evolution(state.evoPeriod);
    const first = points[0];
    const last = points[points.length - 1];
    const classes = P.ASSET_CLASSES.filter((c) => points.some((p) => (p.byClass[c.id] || 0) > 0));
    html +=
      '<section class="card span-12">' +
      '<div class="card-head"><div><h3 class="card-title">Evolução patrimonial</h3>' +
      (points.length > 1 && !hidden() ? '<div class="card-sub">' + signed(last.total - first.total) + ' desde ' + U.fmtMonth(first.month) + '</div>' : '') +
      '</div><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      seg('evoMode', [['total', 'Total'], ['class', 'Por classe']], state.evoMode) +
      seg('evoPeriod', PERIODS, state.evoPeriod) +
      '</div></div>' +
      '<div class="chart-box"><canvas id="ch-evo"></canvas></div>' +
      (state.evoMode === 'total' ? '<div class="legend"><span><i class="dot" style="background:var(--accent)"></i>Patrimônio</span><span><i class="dot" style="background:var(--text-3)"></i>Valor investido (aportes − resgates)</span></div>' : '') +
      '</section>';

    // ---- Alocação
    const slices = state.allocMode === 'class' ? an.allocationByClass() : an.allocationByInstitution();
    html +=
      '<section class="card span-5">' +
      '<div class="card-head"><h3 class="card-title">Distribuição da carteira</h3>' + seg('allocMode', [['class', 'Classe'], ['inst', 'Instituição']], state.allocMode) + '</div>' +
      '<div class="chart-box donut"><canvas id="ch-alloc"></canvas></div>' +
      '<div class="list" style="margin-top:10px">' +
      slices.map((s) => '<div class="row"><i class="dot" style="background:' + s.color + '"></i><div class="grow title">' + esc(s.label) + '</div><div class="muted num">' + money(s.value) + '</div><div class="num" style="width:64px;text-align:right;font-weight:600">' + U.pct(s.share) + '</div></div>').join('') +
      '</div></section>';

    // ---- Rentabilidade
    const perf = an.performance(state.perfPeriod);
    const firstValid = perf.findIndex((p) => p.rate !== null);
    const valid = firstValid >= 0 ? perf.slice(firstValid) : [];
    const portfolioCum = P.Analytics.cumulative(valid);
    const bench = data.benchmarks || {};
    const cdiCum = P.Analytics.cumulative(valid.map((p) => ({ month: p.month, rate: bench.cdi && p.month in bench.cdi ? bench.cdi[p.month] : null })));
    const ipcaCum = P.Analytics.cumulative(valid.map((p) => ({ month: p.month, rate: bench.ipca && p.month in bench.ipca ? bench.ipca[p.month] : null })));
    const accP = portfolioCum.length ? portfolioCum[portfolioCum.length - 1].value : 0;
    const accCDI = cdiCum.length ? cdiCum[cdiCum.length - 1].value : null;
    html +=
      '<section class="card span-7">' +
      '<div class="card-head"><div><h3 class="card-title">Rentabilidade</h3><div class="card-sub">Mensal e acumulada no período</div></div>' + seg('perfPeriod', PERIODS, state.perfPeriod) + '</div>' +
      '<div class="kpi-row" style="margin-top:0;padding-top:0;border:0;margin-bottom:10px">' +
      kpi('Carteira', '<span class="' + cls(accP) + '">' + U.pct(accP, true) + '</span>') +
      (accCDI !== null ? kpi('CDI', '<span style="color:var(--orange)">' + U.pct(accCDI, true) + '</span>') : '') +
      (accCDI !== null && accCDI > 0.0001 ? kpi('% do CDI', U.pct(accP / accCDI)) : '') +
      (ipcaCum.length ? kpi('IPCA', U.pct(ipcaCum[ipcaCum.length - 1].value, true)) : '') +
      '</div>' +
      '<div class="chart-box sm"><canvas id="ch-returns"></canvas></div>' +
      '<div class="chart-box sm" style="margin-top:12px"><canvas id="ch-cum"></canvas></div>' +
      (state.benchError && !Object.keys(bench.cdi || {}).length ? '<div class="faint">' + esc(state.benchError) + '</div>' : '') +
      '</section>';

    // ---- Aportes
    const p12 = an.performance(12);
    const sum = (k) => p12.reduce((a, p) => a + p[k], 0);
    const avg = p12.length ? (sum('aportes') - sum('resgates')) / p12.length : 0;
    html +=
      '<section class="card span-6">' +
      '<div class="card-head"><div><h3 class="card-title">Aportes e proventos</h3><div class="card-sub">Últimos 12 meses · média líquida ' + money(avg) + '/mês</div></div></div>' +
      '<div class="kpi-row" style="margin-top:0;padding-top:0;border:0;margin-bottom:10px">' +
      kpi('Aportado', '<span class="pos">' + money(sum('aportes')) + '</span>') +
      kpi('Resgatado', '<span class="neg">' + money(sum('resgates')) + '</span>') +
      kpi('Proventos', '<span style="color:var(--orange)">' + money(sum('proventos')) + '</span>') +
      '</div>' +
      '<div class="chart-box sm" style="height:210px"><canvas id="ch-flows"></canvas></div>' +
      '</section>';

    // ---- Por instituição
    const byInst = an.allocationByInstitution();
    const prevEnd = U.monthEnd(U.addMonths(U.monthKey(today), -1));
    html +=
      '<section class="card span-6">' +
      '<div class="card-head"><div><h3 class="card-title">Por instituição</h3><div class="card-sub">Variação desde o fim do mês passado</div></div></div><div class="list">' +
      byInst
        .map((s) => {
          const prev = an.assets.filter((a) => (a.institutionId || '_') === s.key).reduce((acc, a) => acc + an.valueOf(a, prevEnd), 0);
          const diff = s.value - prev;
          return (
            '<div class="row">' + badge(s.label, s.color, true) +
            '<div class="grow"><div class="title">' + esc(s.label) + '</div><div class="sub">' + U.pct(s.share) + ' da carteira</div></div>' +
            '<div class="right"><div class="num" style="font-weight:600">' + money(s.value) + '</div>' +
            (prev > 0 ? '<div class="num ' + cls(diff) + '" style="font-size:12.5px">' + signed(diff) + '</div>' : '') +
            '</div></div>'
          );
        })
        .join('') +
      '</div></section>';

    html += '</div>';
    view.innerHTML = html;

    if (state.evoMode === 'total') C.evolution($('#ch-evo'), points, hidden());
    else C.stacked($('#ch-evo'), points, classes, hidden());
    C.donut($('#ch-alloc'), slices, hidden());
    C.returnBars($('#ch-returns'), perf);
    const series = [{ name: 'Carteira', points: portfolioCum }];
    if (cdiCum.length) series.push({ name: 'CDI', points: cdiCum });
    if (ipcaCum.length) series.push({ name: 'IPCA', points: ipcaCum });
    C.cumulative($('#ch-cum'), series);
    C.flows($('#ch-flows'), p12, hidden());
  }

  function kpi(label, value) {
    return '<div class="item"><div class="l">' + esc(label) + '</div><div class="v num">' + value + '</div></div>';
  }

  function describeMonths(m) {
    if (m === 0) return 'agora';
    const y = Math.floor(m / 12);
    const r = m % 12;
    if (!y) return m + (m === 1 ? ' mês' : ' meses');
    if (!r) return y + (y === 1 ? ' ano' : ' anos');
    return y + (y === 1 ? ' ano' : ' anos') + ' e ' + r + (r === 1 ? ' mês' : ' meses');
  }

  // =====================================================================
  // Carteira
  // =====================================================================

  function renderPortfolio(view) {
    view.innerHTML =
      '<div class="toolbar">' +
      '<input id="search" class="search" type="text" placeholder="Buscar investimento, banco ou ticker" value="' + esc(state.search) + '">' +
      seg('group', [['institution', 'Por instituição'], ['class', 'Por classe']], state.group) +
      '<label class="check"><input type="checkbox" id="show-archived"' + (state.showArchived ? ' checked' : '') + '> Mostrar arquivados</label>' +
      '<span class="spacer"></span>' +
      '<button class="btn" data-action="new-institution">+ Instituição</button>' +
      '<button class="btn primary" data-action="new-asset">+ Investimento</button>' +
      '</div><div id="portfolio-list"></div>';
    $('#search').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderPortfolioList();
    });
    $('#show-archived').addEventListener('change', (e) => {
      state.showArchived = e.target.checked;
      renderPortfolioList();
    });
    renderPortfolioList();
  }

  function renderPortfolioList() {
    const box = $('#portfolio-list');
    const q = U.norm(state.search);
    const assets = store.data.assets.filter(
      (a) => (state.showArchived || !a.archived) && (!q || U.norm(a.name).includes(q) || U.norm(instName(a)).includes(q) || U.norm(a.ticker).includes(q))
    );
    if (!store.data.assets.length) {
      box.innerHTML = '<div class="card empty"><h2>Nenhum investimento</h2><p>Adicione seus investimentos de cada banco ou corretora, ou importe sua planilha em Ajustes.</p><div class="actions"><button class="btn primary" data-action="new-asset">+ Adicionar investimento</button></div></div>';
      return;
    }
    const total = assets.reduce((acc, a) => acc + store.currentValue(a.id), 0);
    const groups = {};
    assets.forEach((a) => {
      let key, title, color;
      if (state.group === 'class') {
        const c = P.classById(a.classId);
        key = c.id;
        title = c.title;
        color = c.color;
      } else {
        const inst = instOf(a);
        key = a.institutionId || '_';
        title = inst ? inst.name : 'Sem instituição';
        color = inst ? inst.color : '#8E8E93';
      }
      groups[key] = groups[key] || { title, color, assets: [], total: 0 };
      groups[key].assets.push(a);
      groups[key].total += store.currentValue(a.id);
    });
    const list = Object.values(groups).sort((a, b) => b.total - a.total);

    let html =
      '<div class="card" style="margin-bottom:16px"><div class="kpi-label">Total ' + (q ? 'filtrado' : 'na carteira') + '</div><div class="kpi-value num">' + money(total) + '</div>' +
      '<div class="muted">' + assets.length + ' investimento(s) em ' + new Set(assets.map((a) => a.institutionId)).size + ' instituição(ões)</div></div>';
    if (!list.length) html += '<div class="card empty"><p>Nada encontrado para "' + esc(state.search) + '".</p></div>';
    html += '<div class="grid">';
    list.forEach((grp) => {
      html +=
        '<section class="card span-6"><div class="group-head"><span style="display:flex;align-items:center;gap:8px"><i class="dot" style="background:' + grp.color + '"></i>' + esc(grp.title) + '</span><span class="num">' + money(grp.total) + '</span></div><div class="list">';
      grp.assets
        .sort((a, b) => store.currentValue(b.id) - store.currentValue(a.id))
        .forEach((a) => {
          const c = P.classById(a.classId);
          const value = store.currentValue(a.id);
          const inv = store.invested(a.id);
          const gp = inv > 0 ? store.gain(a.id) / inv : null;
          const sub = [state.group === 'class' ? instName(a) : c.title, a.indexer, total > 0 ? U.pct(value / total) : ''].filter(Boolean).join(' · ');
          html +=
            '<div class="row clickable" data-action="open-asset" data-id="' + a.id + '">' + badge(c.title, c.color) +
            '<div class="grow"><div class="title">' + esc(a.name) + (a.archived ? ' <span class="tag">arquivado</span>' : '') + '</div><div class="sub">' + esc(sub) + '</div></div>' +
            '<div class="right"><div class="num" style="font-weight:600">' + money(value) + '</div>' +
            (gp !== null ? '<div class="num ' + cls(gp) + '" style="font-size:12.5px">' + U.pct(gp, true) + '</div>' : '') +
            '</div></div>';
        });
      html += '</div></section>';
    });
    html += '</div>';
    box.innerHTML = html;
  }

  // =====================================================================
  // Detalhe do investimento
  // =====================================================================

  function renderAsset(view) {
    const a = store.asset(state.assetId);
    if (!a) return go('portfolio');
    const c = P.classById(a.classId);
    const inst = instOf(a);
    const snaps = store.snapshotsOf(a.id);
    const value = store.currentValue(a.id);
    const inv = store.invested(a.id);
    const gain = store.gain(a.id);
    const last = store.lastUpdate(a.id);
    $('#page-title').textContent = a.name;

    const history = snaps
      .map((s) => ({ date: s.date, type: 'snap', item: s }))
      .concat(store.movementsOf(a.id).map((m) => ({ date: m.date, type: 'mov', item: m })))
      .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.type === 'snap' ? 1 : -1));

    let info = '';
    const line = (l, v) => (v ? '<div class="row"><div class="grow muted">' + esc(l) + '</div><div>' + v + '</div></div>' : '');
    info += line('Instituição', esc(inst ? inst.name : 'Sem instituição'));
    info += line('Classe', esc(c.title));
    info += line('Indexador', esc(a.indexer));
    info += line('Código / ticker', esc(a.ticker));
    if (a.maturity) {
      const days = U.daysBetween(U.today(), a.maturity);
      info += line('Vencimento', U.fmtDate(a.maturity) + (days >= 0 ? ' <span class="muted">(' + days + ' dias)</span>' : ' <span class="tag">vencido</span>'));
    }
    info += line('Cadastrado em', U.fmtDate(a.createdAt));
    if (a.notes) info += '<p class="muted">' + esc(a.notes) + '</p>';

    view.innerHTML =
      '<div class="toolbar"><button class="btn small" data-action="go" data-id="portfolio">‹ Carteira</button><span class="spacer"></span>' +
      '<button class="btn" data-action="edit-asset" data-id="' + a.id + '">Editar</button>' +
      '<button class="btn primary" data-action="quick-update" data-id="' + a.id + '">Atualizar saldo / movimentar</button></div>' +
      '<div class="grid">' +
      '<section class="card span-12"><div style="display:flex;align-items:center;gap:12px">' + badge(c.title, c.color) +
      '<div><div class="muted" style="font-size:13px">' + esc(c.title) + ' · ' + esc(inst ? inst.name : 'Sem instituição') + '</div><div style="font-weight:650">' + esc(a.name) + (a.archived ? ' <span class="tag">arquivado</span>' : '') + '</div></div></div>' +
      '<div class="kpi-value num" style="margin-top:12px">' + money(value) + '</div>' +
      '<div class="num ' + cls(gain) + '">' + signed(gain) + (inv > 0 ? ' (' + U.pct(gain / inv, true) + ')' : '') + ' <span class="muted">de resultado</span></div>' +
      '<div class="kpi-row">' + kpi('Valor investido', money(inv)) + kpi('Proventos recebidos', money(store.proventos(a.id))) + kpi('Última atualização', last ? U.fmtDate(last) : '—') + '</div></section>' +
      (snaps.length >= 2 ? '<section class="card span-8"><h3 class="card-title">Evolução</h3><div class="chart-box" style="margin-top:10px"><canvas id="ch-asset"></canvas></div></section>' : '') +
      '<section class="card ' + (snaps.length >= 2 ? 'span-4' : 'span-12') + '"><h3 class="card-title">Informações</h3><div class="list">' + info + '</div></section>' +
      '<section class="card span-12"><h3 class="card-title">Histórico</h3><div class="list">' +
      (history.length
        ? history
            .map((h) => {
              if (h.type === 'snap') {
                return '<div class="row"><span class="badge round" style="background:#0A84FF">=</span><div class="grow"><div class="title">Saldo informado</div><div class="sub">' + U.fmtDate(h.date) + '</div></div><div class="num">' + money(h.item.value) + '</div><button class="icon-btn" title="Apagar" data-action="delete-snapshot" data-id="' + h.item.id + '">×</button></div>';
              }
              const k = P.kindById(h.item.kind);
              return '<div class="row"><span class="badge round" style="background:' + k.color + '">' + (k.id === 'aporte' ? '+' : k.id === 'resgate' ? '−' : '$') + '</span><div class="grow"><div class="title">' + esc(k.title) + (h.item.note ? ' · ' + esc(h.item.note) : '') + '</div><div class="sub">' + U.fmtDate(h.date) + '</div></div><div class="num" style="color:' + k.color + '">' + money(h.item.amount) + '</div><button class="icon-btn" title="Apagar" data-action="delete-movement" data-id="' + h.item.id + '">×</button></div>';
            })
            .join('')
        : '<p class="muted">Nenhum registro ainda.</p>') +
      '</div></section>' +
      '<section class="card span-12" style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn" data-action="toggle-archive" data-id="' + a.id + '">' + (a.archived ? 'Reativar investimento' : 'Arquivar (resgatado/encerrado)') + '</button>' +
      '<button class="btn danger" data-action="delete-asset" data-id="' + a.id + '">Excluir investimento</button></section>' +
      '</div>';
    if (snaps.length >= 2) C.assetHistory($('#ch-asset'), snaps, c.color, hidden());
  }

  // =====================================================================
  // Atualizar saldos (fechamento do mês)
  // =====================================================================

  function renderUpdate(view) {
    const assets = store.data.assets.filter((a) => !a.archived);
    if (!assets.length) {
      view.innerHTML = '<div class="card empty"><h2>Nada para atualizar</h2><p>Cadastre seus investimentos na Carteira ou importe sua planilha em Ajustes.</p><div class="actions"><button class="btn primary" data-action="new-asset">+ Adicionar investimento</button></div></div>';
      return;
    }
    const mk = U.monthKey(state.updateDate);
    const outdated = assets.filter((a) => {
      const l = store.lastUpdate(a.id);
      return !l || U.monthKey(l) !== mk;
    }).length;

    const groups = {};
    assets.forEach((a) => {
      const k = a.institutionId || '_';
      groups[k] = groups[k] || { inst: instOf(a), assets: [] };
      groups[k].assets.push(a);
    });
    const ordered = Object.values(groups).sort((x, y) => (x.inst ? x.inst.name : 'zzz').localeCompare(y.inst ? y.inst.name : 'zzz'));

    let rows = '';
    ordered.forEach((grp) => {
      rows += '<tr class="inst"><td colspan="4"><span style="display:inline-flex;align-items:center;gap:8px"><i class="dot" style="background:' + (grp.inst ? grp.inst.color : '#8E8E93') + '"></i>' + esc(grp.inst ? grp.inst.name : 'Sem instituição') + '</span></td></tr>';
      grp.assets
        .sort((x, y) => x.name.localeCompare(y.name))
        .forEach((a) => {
          const e = state.entries[a.id] || {};
          const last = store.lastUpdate(a.id);
          const done = last && U.monthKey(last) === mk;
          rows +=
            '<tr data-row="' + a.id + '" class="' + (e.balance || e.amount ? 'dirty' : '') + '">' +
            '<td><div style="font-weight:550">' + (done ? '<span class="pos" title="Atualizado neste mês">✓</span> ' : '') + esc(a.name) + '</div><div class="faint">' + esc(P.classById(a.classId).title) + '</div></td>' +
            '<td class="last num muted">' + (last ? money(store.currentValue(a.id)) + '<div class="faint">em ' + U.fmtDate(last) + '</div>' : 'Sem saldo') + '</td>' +
            '<td><div style="display:flex;gap:4px;align-items:center"><input class="money-input" inputmode="decimal" data-balance="' + a.id + '" placeholder="novo saldo" value="' + esc(e.balance || '') + '">' +
            (last ? '<button class="btn small" title="Repetir o último saldo" data-action="fill-last" data-id="' + a.id + '">=</button>' : '') + '</div>' +
            '<div class="faint num" data-diff="' + a.id + '"></div></td>' +
            '<td class="flowcell"><div class="flow"><select data-kind="' + a.id + '">' +
            P.MOVEMENT_KINDS.map((k) => '<option value="' + k.id + '"' + (e.kind === k.id ? ' selected' : '') + '>' + k.title + '</option>').join('') +
            '</select><input class="money-input" style="width:120px" inputmode="decimal" data-amount="' + a.id + '" placeholder="valor" value="' + esc(e.amount || '') + '"></div></td>' +
            '</tr>';
        });
    });

    view.innerHTML =
      '<div class="card" style="margin-bottom:16px"><div class="toolbar" style="margin:0">' +
      '<div class="field" style="margin:0"><label for="upd-date">Data dos saldos</label><input type="date" id="upd-date" value="' + state.updateDate + '" max="' + U.today() + '"></div>' +
      '<div class="grow" style="flex:1;min-width:240px">' +
      (outdated === 0 ? '<span class="pos">✓ Todos os investimentos já têm saldo em ' + U.fmtMonthLong(mk) + '.</span>' : '<strong>' + outdated + '</strong> de ' + assets.length + ' investimento(s) sem saldo em ' + U.fmtMonthLong(mk) + '.') +
      '<div class="faint">Abra o app de cada banco e digite o saldo atual. Campos vazios mantêm o último saldo. Registre aportes e resgates na coluna "Movimentação" para a rentabilidade ficar correta. O botão "=" repete o saldo anterior.</div></div>' +
      '</div></div>' +
      '<div class="card"><table class="update-table"><thead><tr><th>Investimento</th><th>Último saldo</th><th>Saldo atual</th><th>Movimentação (opcional)</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="toolbar" style="margin:16px 0 0"><span class="spacer"></span><button class="btn" data-action="clear-update">Limpar</button><button class="btn primary" id="save-update" data-action="save-update" disabled>Salvar atualizações</button></div></div>';

    $('#upd-date').addEventListener('change', (e) => {
      state.updateDate = e.target.value || U.today();
      render();
    });
    $$('[data-balance],[data-amount],[data-kind]').forEach((el) => {
      el.addEventListener('input', onUpdateInput);
      el.addEventListener('change', onUpdateInput);
    });
    Object.keys(state.entries).forEach(updateDiff);
    updateSaveButton();
  }

  function onUpdateInput(e) {
    const el = e.target;
    const id = el.dataset.balance || el.dataset.amount || el.dataset.kind;
    const entry = (state.entries[id] = state.entries[id] || { kind: 'aporte' });
    if (el.dataset.balance) entry.balance = el.value;
    if (el.dataset.amount) entry.amount = el.value;
    if (el.dataset.kind) entry.kind = el.value;
    const row = $('tr[data-row="' + id + '"]');
    if (row) row.classList.toggle('dirty', !!(entry.balance || entry.amount));
    updateDiff(id);
    updateSaveButton();
  }

  function updateDiff(id) {
    const el = $('[data-diff="' + id + '"]');
    const e = state.entries[id];
    if (!el || !e) return;
    const v = U.parseNumber(e.balance);
    if (v === null || hidden()) {
      el.textContent = '';
      return;
    }
    const diff = v - store.currentValue(id);
    el.textContent = U.signedMoney(diff);
    el.className = 'faint num ' + cls(diff);
  }

  function pendingEntries() {
    return Object.keys(state.entries).filter((id) => {
      const e = state.entries[id];
      return U.parseNumber(e.balance) !== null || (U.parseNumber(e.amount) || 0) > 0;
    });
  }

  function updateSaveButton() {
    const btn = $('#save-update');
    if (!btn) return;
    const n = pendingEntries().length;
    btn.disabled = n === 0;
    btn.textContent = n ? 'Salvar ' + n + ' atualização(ões)' : 'Salvar atualizações';
  }

  function saveUpdate() {
    const date = state.updateDate;
    const before = new P.Analytics(store.data).total();
    let balances = 0, flows = 0;
    pendingEntries().forEach((id) => {
      const e = state.entries[id];
      const v = U.parseNumber(e.balance);
      if (v !== null) {
        store.recordBalance(id, date, v, false);
        balances++;
      }
      const amt = U.parseNumber(e.amount);
      if (amt && amt > 0) {
        store.recordMovement(id, e.kind || 'aporte', Math.abs(amt), date, '', false);
        flows++;
      }
    });
    state.entries = {};
    store.commit();
    const after = new P.Analytics(store.data).total();
    toast(balances + ' saldo(s) e ' + flows + ' movimentação(ões) salvos.' + (hidden() ? '' : ' Patrimônio: ' + U.money(after) + ' (' + U.signedMoney(after - before) + ')'));
  }

  // =====================================================================
  // Orçamento
  // =====================================================================

  /** Filtros do Orçamento: tipo (receitas/despesas), categoria e dia. */
  function cashFilters() {
    return { type: state.cashType || 'all', category: state.cashCategory || null, day: state.cashDay || null };
  }

  function setCashFilter(patch) {
    Object.assign(state, patch);
    // Categoria de receita não combina com filtro de despesas (e vice-versa).
    if (state.cashCategory) {
      const c = P.categoryById(state.cashCategory);
      if ((state.cashType === 'income' && !c.income) || (state.cashType === 'expense' && c.income)) state.cashCategory = null;
    }
    if (state.cashDay && U.monthKey(state.cashDay) !== state.cashMonth) state.cashDay = null;
    render();
  }

  function matchesCash(t, f, opts) {
    opts = opts || {};
    if (f.type === 'income' && !t.income) return false;
    if (f.type === 'expense' && t.income) return false;
    if (f.category && !opts.ignoreCategory && !P.inCategory(t.category, f.category)) return false;
    if (f.day && !opts.ignoreDay && t.date !== f.day) return false;
    return true;
  }

  function renderCashflow(view) {
    const txs = store.data.transactions;
    const mk = state.cashMonth;
    const f = cashFilters();
    const monthItems = txs.filter((t) => U.monthKey(t.date) === mk);
    const income = monthItems.filter((t) => t.income).reduce((a, t) => a + t.amount, 0);
    const expense = monthItems.filter((t) => !t.income).reduce((a, t) => a + t.amount, 0);
    const balance = income - expense;
    const selCat = f.category ? P.categoryById(f.category) : null;

    // Rosca: categorias do tipo escolhido (despesas por padrão), respeitando o filtro de dia.
    const donutIncome = f.type === 'income' || (selCat && selCat.income);
    // Com uma categoria que tem subcategorias selecionada, a rosca "abre" nas subcategorias dela.
    const drillRoot = selCat ? P.rootCategory(selCat.id) : null;
    const drill = drillRoot && P.subcategoriesOf(drillRoot.id).length > 0 ? drillRoot : null;
    const byCat = {};
    monthItems
      .filter((t) => t.income === !!donutIncome && (!f.day || t.date === f.day) && (!drill || P.inCategory(t.category, drill.id)))
      .forEach((t) => {
        const c = drill ? P.categoryById(t.category) : P.rootCategory(t.category);
        const direct = drill && c.id === drill.id;
        const key = c.id;
        byCat[key] = byCat[key] || { key, label: direct ? drill.title + ' (sem subcategoria)' : c.title, color: c.color, value: 0, count: 0, subs: !drill && P.subcategoriesOf(c.id).length };
        byCat[key].value += t.amount;
        byCat[key].count++;
      });
    const cats = Object.values(byCat).sort((a, b) => b.value - a.value);
    const catTotal = cats.reduce((a, c) => a + c.value, 0);
    cats.forEach((c) => (c.share = catTotal ? c.value / catTotal : 0));

    // Últimos 6 meses: acompanha o filtro de tipo/categoria.
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = U.addMonths(mk, -i);
      const list = txs.filter((t) => U.monthKey(t.date) === m);
      months.push({
        month: m,
        income: list.filter((t) => t.income).reduce((a, t) => a + t.amount, 0),
        expense: list.filter((t) => !t.income).reduce((a, t) => a + t.amount, 0),
        filtered: list.filter((t) => matchesCash(t, f, { ignoreDay: true })).reduce((a, t) => a + t.amount, 0),
      });
    }
    const theme = C.theme();
    let series;
    if (selCat) series = [{ key: selCat.income ? 'income' : 'expense', label: selCat.title, color: selCat.color, values: months.map((m) => m.filtered) }];
    else if (f.type === 'income') series = [{ key: 'income', label: 'Receitas', color: theme.green, values: months.map((m) => m.income) }];
    else if (f.type === 'expense') series = [{ key: 'expense', label: 'Despesas', color: theme.red, values: months.map((m) => m.expense) }];

    // Por dia do mês (filtro atual, sem o filtro de dia).
    const dim = U.daysInMonth(mk);
    const daily = [];
    for (let d = 1; d <= dim; d++) {
      const day = mk + '-' + String(d).padStart(2, '0');
      const dayType = f.type === 'all' && !selCat ? 'expense' : null;
      const value = monthItems
        .filter((t) => t.date === day && matchesCash(t, dayType ? Object.assign({}, f, { type: dayType }) : f, { ignoreDay: true }))
        .reduce((a, t) => a + t.amount, 0);
      daily.push({ day, value });
    }
    const dailyLabel = selCat ? selCat.title : f.type === 'income' ? 'Receitas' : 'Despesas';
    const dailyColor = selCat ? selCat.color : f.type === 'income' ? theme.green : theme.red;

    // Lançamentos filtrados
    const items = monthItems.filter((t) => matchesCash(t, f));
    const filteredTotal = items.reduce((a, t) => a + (t.income ? t.amount : -t.amount), 0);
    const days = {};
    items.forEach((t) => (days[t.date] = days[t.date] || []).push(t));
    const dayKeys = Object.keys(days).sort().reverse();

    const chip = (label, patch) =>
      '<button class="chip active-filter" data-action="cash-filter" data-id="' + esc(JSON.stringify(patch)) + '">' + esc(label) + ' <span aria-hidden="true">×</span></button>';
    const chips = [];
    if (f.type !== 'all') chips.push(chip(f.type === 'income' ? 'Receitas' : 'Despesas', { cashType: 'all' }));
    if (selCat) chips.push(chip(P.categoryLabel(selCat.id), { cashCategory: selCat.parentId || null }));
    if (f.day) chips.push(chip('Dia ' + U.fmtShortDate(f.day), { cashDay: null }));
    const filterBar = chips.length
      ? '<div class="filter-bar"><span class="faint">Filtrando:</span>' + chips.join('') + '<button class="btn small ghost" data-action="cash-filter" data-id="' + esc(JSON.stringify({ cashType: 'all', cashCategory: null, cashDay: null })) + '">Limpar filtros</button></div>'
      : '<div class="filter-bar faint">Clique nos gráficos, nas categorias ou nos totais para filtrar.</div>';

    const tile = (label, value, valueCls, type, extra) =>
      '<button class="kpi-tile' + (type !== 'all' && f.type === type ? ' selected' : '') + '" title="' + (type === 'all' ? 'Mostrar tudo' : 'Filtrar ' + esc(label.toLowerCase())) + '" data-action="cash-filter" data-id="' + esc(JSON.stringify({ cashType: type !== 'all' && f.type === type ? 'all' : type, cashCategory: null })) + '">' +
      '<div class="l">' + esc(label) + '</div><div class="v num ' + valueCls + '">' + value + '</div>' + (extra || '') + '</button>';

    view.innerHTML =
      '<div class="toolbar"><button class="btn small" data-action="cash-prev">‹</button><strong style="min-width:170px;text-align:center">' + U.fmtMonthLong(mk) + '</strong><button class="btn small" data-action="cash-next">›</button>' +
      '<span class="spacer"></span><button class="btn" data-action="manage-categories">Categorias</button><button class="btn" data-action="import-statement">Importar extrato</button><button class="btn" data-action="import-invoice">Importar fatura (PDF)</button><button class="btn" data-action="new-income">+ Receita</button><button class="btn primary" data-action="new-expense">+ Despesa</button></div>' +
      filterBar +
      '<div class="grid">' +
      '<section class="card span-12"><div class="kpi-tiles">' +
      tile('Receitas', money(income), 'pos', 'income') +
      tile('Despesas', money(expense), 'neg', 'expense') +
      tile('Saldo do mês', money(balance), cls(balance), 'all', income > 0 ? '<div class="faint">Taxa de poupança ' + U.pct(balance / income) + '</div>' : '') +
      (selCat
        ? (() => {
            const v = monthItems.filter((t) => P.inCategory(t.category, selCat.id)).reduce((a, t) => a + t.amount, 0);
            const base = selCat.income ? income : expense;
            return '<div class="kpi-tile static"><div class="l">' + esc(P.categoryLabel(selCat.id)) + '</div><div class="v num">' + money(v) + '</div><div class="faint">' + U.pct(base ? v / base : 0) + ' das ' + (selCat.income ? 'receitas' : 'despesas') + '</div></div>';
          })()
        : '') +
      '</div>' +
      (income > 0 ? '<div class="progress" style="margin-top:14px"><span style="width:' + Math.min(100, (expense / income) * 100).toFixed(1) + '%;background:' + (expense > income ? 'var(--red)' : 'var(--orange)') + '"></span></div><div class="faint" style="margin-top:6px">Você gastou ' + U.pct(expense / income) + ' do que recebeu.</div>' : '') +
      '</section>' +
      '<section class="card span-5"><div class="card-head"><div><h3 class="card-title">' +
      (drill ? esc(drill.title) + ' por subcategoria' : (donutIncome ? 'Receitas' : 'Gastos') + ' por categoria') + (f.day ? ' · ' + U.fmtShortDate(f.day) : '') + '</h3>' +
      (drill ? '<button class="linklike faint" data-action="cash-filter" data-id="' + esc(JSON.stringify({ cashCategory: null })) + '">‹ voltar para todas as categorias</button>' : '') + '</div>' +
      seg('cashType', [['all', 'Tudo'], ['expense', 'Despesas'], ['income', 'Receitas']], f.type) + '</div>' +
      (cats.length
        ? '<div class="chart-box donut" style="margin-top:6px"><canvas id="ch-cats"></canvas></div><div class="list" style="margin-top:10px">' +
          cats
            .map(
              (c) =>
                '<div class="row clickable cat-row' + (selCat && selCat.id === c.key ? ' selected' : selCat && !(drill && selCat.id === drill.id) ? ' dimmed' : '') + '" data-action="cash-cat" data-id="' + c.key + '">' +
                '<i class="dot" style="background:' + c.color + '"></i><div class="grow"><div class="title">' + esc(c.label) + (c.subs ? ' <span class="faint">›</span>' : '') + '</div><div class="sub">' + c.count + ' lançamento(s)' + (c.subs ? ' · ' + c.subs + ' subcategoria(s)' : '') + '</div></div>' +
                '<div class="num">' + money(c.value) + '</div><div class="muted num" style="width:60px;text-align:right">' + U.pct(c.share) + '</div></div>'
            )
            .join('') +
          '</div>'
        : '<p class="muted">Nenhum lançamento ' + (donutIncome ? 'de receita' : 'de despesa') + ' neste mês.</p>') +
      '</section>' +
      '<section class="card span-7"><div class="card-head"><div><h3 class="card-title">Últimos 6 meses' + (selCat ? ' · ' + esc(selCat.title) : '') + '</h3><div class="card-sub">Clique numa barra para ver o mês</div></div></div><div class="chart-box" style="margin-top:4px;height:230px"><canvas id="ch-cash"></canvas></div>' +
      '<h3 class="card-title" style="margin-top:14px">' + esc(dailyLabel) + ' por dia</h3><div class="card-sub">Clique num dia para ver os lançamentos</div><div class="chart-box sm" style="margin-top:6px"><canvas id="ch-daily"></canvas></div></section>' +
      '<section class="card span-12"><div class="card-head"><h3 class="card-title">Lançamentos' + (chips.length ? ' filtrados' : '') + '</h3><div class="num muted">' + items.length + ' · ' + (hidden() ? U.MASK : U.signedMoney(filteredTotal)) + '</div></div>' +
      (dayKeys.length
        ? dayKeys
            .map(
              (d) =>
                '<div class="group-head" style="margin-top:12px"><button class="linklike" data-action="cash-day" data-id="' + d + '">' + U.fmtDate(d) + '</button><span class="num">' + money(days[d].reduce((a, t) => a + (t.income ? t.amount : -t.amount), 0)) + '</span></div><div class="list">' +
                days[d]
                  .sort((a, b) => b.amount - a.amount)
                  .map((t) => {
                    const c = P.categoryById(t.category);
                    return (
                      '<div class="row clickable" data-action="edit-tx" data-id="' + t.id + '">' + badge(c.title, c.color) +
                      '<div class="grow"><div class="title">' + esc(t.note || c.title) + '</div>' +
                      '<button class="chip small-chip" data-action="cash-cat" data-id="' + c.id + '" title="Filtrar por ' + esc(P.categoryLabel(c.id)) + '"><i class="dot" style="background:' + c.color + '"></i>' + esc(P.categoryLabel(c.id)) + '</button></div>' +
                      '<div class="num ' + (t.income ? 'pos' : '') + '" style="font-weight:600">' + (t.income ? '+' : '−') + money(t.amount) + '</div></div>'
                    );
                  })
                  .join('') +
                '</div>'
            )
            .join('')
        : '<p class="muted">' + (chips.length ? 'Nenhum lançamento com esses filtros.' : 'Nenhum lançamento neste mês. Use "+ Despesa" ou "+ Receita".') + '</p>') +
      '</section></div>';

    if (cats.length) {
      C.donut($('#ch-cats'), cats, hidden(), {
        selected: selCat && !(drill && selCat.id === drill.id) ? selCat.id : null,
        onClick: (slice) =>
          setCashFilter({ cashCategory: state.cashCategory === slice.key ? (drill && slice.key !== drill.id ? drill.id : null) : slice.key }),
      });
    }
    C.cashBars($('#ch-cash'), months, hidden(), {
      current: mk,
      series,
      onClick: (month, key) => {
        const patch = { cashMonth: month, cashDay: null };
        if (key && !selCat) patch.cashType = key;
        setCashFilter(patch);
      },
    });
    C.dailyBars($('#ch-daily'), daily, hidden(), {
      selected: f.day,
      color: dailyColor,
      label: dailyLabel,
      onClick: (day) => setCashFilter({ cashDay: state.cashDay === day ? null : day }),
    });
  }

  // =====================================================================
  // Ajustes
  // =====================================================================

  function renderSettings(view) {
    const d = store.data;
    const bench = d.benchmarks || {};
    view.innerHTML =
      '<div class="grid">' +
      '<section class="card span-6"><h3 class="card-title">Onde ficam seus dados</h3><p><strong>' + esc(store.backend.label) + '</strong></p><p class="muted" id="storage-info">…</p>' +
      (store.backend.id === 'desktop' ? '<p><button class="btn small" data-action="open-data-folder">Abrir pasta dos dados</button> <span class="faint">Uma cópia de segurança é feita automaticamente por dia.</span></p>' : '') +
      '<div class="faint">Nenhuma senha de banco é pedida: você informa os saldos ou importa sua planilha.</div></section>' +
      '<section class="card span-6"><h3 class="card-title">Meta de patrimônio</h3><div class="field" style="margin-top:10px"><label for="goal-input">Valor da meta (R$)</label>' +
      '<div style="display:flex;gap:8px"><input id="goal-input" class="money-input" inputmode="decimal" placeholder="Ex.: 1.000.000" value="' + (d.settings.goal ? U.editable(d.settings.goal) : '') + '"><button class="btn primary" data-action="save-goal">Salvar</button></div>' +
      '<div class="hint">Aparece no Início com o progresso e a estimativa de quando você chega lá. Deixe vazio para ocultar.</div></div></section>' +
      '<section class="card span-6"><div class="card-head"><h3 class="card-title">Bancos e corretoras</h3><button class="btn small" data-action="new-institution">+ Adicionar</button></div><div class="list">' +
      (d.institutions.length
        ? d.institutions
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((i) => {
              const n = d.assets.filter((a) => a.institutionId === i.id && !a.archived).length;
              const total = d.assets.filter((a) => a.institutionId === i.id).reduce((acc, a) => acc + store.currentValue(a.id), 0);
              return '<div class="row">' + badge(i.name, i.color, true) + '<div class="grow"><div class="title">' + esc(i.name) + '</div><div class="sub">' + n + ' investimento(s) ativo(s)</div></div><div class="num muted">' + money(total) + '</div>' +
                '<button class="btn small" data-action="edit-institution" data-id="' + i.id + '">Editar</button><button class="icon-btn" title="Excluir" data-action="delete-institution" data-id="' + i.id + '">×</button></div>';
            })
            .join('')
        : '<p class="muted">Nenhuma instituição cadastrada.</p>') +
      '</div></section>' +
      '<section class="card span-6"><h3 class="card-title">Planilhas</h3><p class="muted">Traga sua planilha do Excel ou Google Planilhas salvando-a como CSV.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn primary" data-action="import-csv">Importar planilha (CSV)</button><button class="btn" data-action="import-statement">Importar extrato bancário</button><button class="btn" data-action="import-invoice">Importar fatura do cartão (PDF)</button><button class="btn" data-action="csv-help">Como preparar a planilha</button></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"><button class="btn" data-action="export-csv"' + (d.assets.length ? '' : ' disabled') + '>Exportar investimentos</button><button class="btn" data-action="export-tx"' + (d.transactions.length ? '' : ' disabled') + '>Exportar orçamento</button></div></section>' +
      '<section class="card span-6"><h3 class="card-title">Backup</h3><p class="muted">Um arquivo com todos os dados. Serve também para levar seus dados entre a versão Windows e a versão web.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn" data-action="export-json">Exportar backup (.json)</button><button class="btn" data-action="import-json">Restaurar backup</button></div></section>' +
      '<section class="card span-6"><h3 class="card-title">Indicadores (CDI e IPCA)</h3><p class="muted">Dados públicos do Banco Central, usados para comparar a rentabilidade.</p>' +
      '<p>Última atualização: <strong>' + (bench.updated ? new Date(bench.updated).toLocaleString('pt-BR') : 'nunca') + '</strong></p>' +
      (state.benchError ? '<p class="neg" style="font-size:13px">' + esc(state.benchError) + '</p>' : '') +
      '<button class="btn" data-action="refresh-bench"' + (state.benchLoading ? ' disabled' : '') + '>' + (state.benchLoading ? 'Atualizando…' : 'Atualizar agora') + '</button></section>' +
      categoriesCard() +
      '<section class="card span-12"><h3 class="card-title">Dados</h3><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"><button class="btn" data-action="sample">Carregar dados de exemplo</button><button class="btn danger" data-action="wipe">Apagar todos os dados</button></div></section>' +
      '</div>';
    if (store.backend.info) {
      store.backend
        .info()
        .then((info) => {
          const el = $('#storage-info');
          if (!el) return;
          el.innerHTML = info.url ? 'Planilha: <a href="' + esc(info.url) + '" target="_blank" rel="noopener">' + esc(info.name || 'abrir') + '</a>' : esc(info.location || '');
        })
        .catch(() => {});
    }
  }

  async function refreshBenchmarks(force) {
    const b = store.data.benchmarks || {};
    const fresh = b.updated && Date.now() - new Date(b.updated).getTime() < 12 * 3600 * 1000 && Object.keys(b.cdi || {}).length;
    if (!force && fresh) return;
    if (!store.backend.fetchSeries) return;
    state.benchLoading = true;
    if (state.view === 'settings') render();
    try {
      const [cdi, ipca] = await Promise.all([store.backend.fetchSeries(4391), store.backend.fetchSeries(433)]);
      state.benchError = null;
      store.setBenchmarks(P.parseSeries(cdi), P.parseSeries(ipca));
      if (force) toast('CDI e IPCA atualizados.');
    } catch (e) {
      console.warn(e);
      state.benchError = 'Não foi possível atualizar CDI/IPCA agora. Verifique sua conexão.';
      queueRender();
    } finally {
      state.benchLoading = false;
      queueRender();
    }
  }

  function pickFile(accept, handler) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const buf = new Uint8Array(reader.result);
        let text = new TextDecoder('utf-8').decode(buf);
        // Planilhas salvas pelo Excel no Windows costumam vir em Windows-1252.
        if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
        handler(text, file.name);
      };
      reader.readAsArrayBuffer(file);
    });
    document.body.appendChild(input);
    input.click();
  }

  function importCSV(text) {
    const rows = P.csv.parse(text);
    if (rows.length && P.statement.isStatement(rows[0])) return openStatementPreview(text);
    try {
      const summary = P.csv.importInto(store, text);
      openModal({ title: 'Importação concluída', body: '<p>' + esc(P.csv.describe(summary)) + '</p>', actions: [{ label: 'Ver carteira', cls: 'primary', onClick: (close) => (close(), go('portfolio')) }] });
    } catch (e) {
      openModal({ title: 'Não foi possível importar', body: '<p>' + esc(e.message) + '</p><p class="muted">Veja "Como preparar a planilha" para os formatos aceitos.</p>' });
    }
  }

  /** Tabela de prévia usada pelo extrato e pela fatura. */
  function previewTable(rows) {
    const catOptions = (r) => categoryOptions(r.income, r.category, false);
    const tag = (t, title) => ' <span class="tag"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(t) + '</span>';
    return (
      '<div style="overflow-x:auto"><table class="update-table statement-table"><thead><tr><th></th><th>Data</th><th>Descrição</th><th style="text-align:right">Valor</th><th>Categoria</th></tr></thead><tbody>' +
      rows
        .map(
          (r, i) =>
            '<tr class="' + (r.include ? '' : 'off') + '">' +
            '<td><input type="checkbox" data-st-inc="' + i + '"' + (r.include ? ' checked' : '') + (r.duplicate ? ' disabled' : '') + '></td>' +
            '<td class="num" style="white-space:nowrap">' + U.fmtShortDate(r.date) + '</td>' +
            '<td><div style="font-weight:550">' + esc(r.title) +
            (r.investment ? tag('investimento') : '') +
            (r.tags || []).map((t) => tag(t)).join('') +
            (r.duplicate ? tag('já importado') : '') +
            (r.remembered ? tag('lembrado', 'Categoria que você escolheu antes') : '') +
            '</div><div class="faint">' + esc(r.details || (r.installment ? 'Parcela ' + r.installment.n + '/' + r.installment.total + ' · compra em ' + U.fmtDate(r.purchaseDate) : r.section ? 'Seção da fatura: ' + r.section.charAt(0).toUpperCase() + r.section.slice(1) : '')) + '</div></td>' +
            '<td class="num ' + (r.income ? 'pos' : 'neg') + '" style="text-align:right;white-space:nowrap">' + (r.income ? '+' : '−') + U.money(r.amount) + '</td>' +
            '<td><select data-st-cat="' + i + '" style="width:170px">' + catOptions(r) + '</select></td>' +
            '</tr>'
        )
        .join('') +
      '</tbody></table></div>'
    );
  }

  function markKnown(rows) {
    const known = new Set(store.data.transactions.map((t) => t.ref).filter(Boolean));
    P.statement.applyRules(rows, store.data.settings.categoryRules);
    rows.forEach((r) => {
      r.duplicate = known.has(r.ref);
      if (r.duplicate) r.include = false;
    });
  }

  /** Lê as escolhas da tabela de volta para as linhas. */
  function readPreview(form, rows) {
    $$('[data-st-inc]', form).forEach((el) => (rows[el.dataset.stInc].include = el.checked));
    $$('[data-st-cat]', form).forEach((el) => (rows[el.dataset.stCat].category = el.value));
  }

  function bindPreviewTotals(form, rows, extra) {
    const recalc = () => {
      let inc = 0, exp = 0;
      $$('[data-st-inc]', form).forEach((el) => {
        const r = rows[el.dataset.stInc];
        el.closest('tr').classList.toggle('off', !el.checked);
        if (el.checked) r.income ? (inc += r.amount) : (exp += r.amount);
      });
      const i = $('#st-inc', form), e = $('#st-exp', form);
      if (i) i.textContent = money(inc);
      if (e) e.textContent = money(exp);
      if (extra) extra(inc, exp);
    };
    $$('[data-st-inc]', form).forEach((el) => el.addEventListener('change', recalc));
    recalc();
  }

  function openStatementPreview(text) {
    let parsed;
    try {
      parsed = P.statement.parse(text);
    } catch (e) {
      return openModal({ title: 'Não foi possível ler o extrato', body: '<p>' + esc(e.message) + '</p>' });
    }
    const { rows, skipped } = parsed;
    markKnown(rows);
    // Com faturas detalhadas, o pagamento da fatura na conta é só uma transferência.
    const itemized = !!store.data.settings.cardItemized;
    let cardRows = 0;
    rows.forEach((r) => {
      if (itemized && !r.income && r.category === 'cartao') {
        r.include = false;
        r.tags = (r.tags || []).concat('fatura detalhada');
        cardRows++;
      }
    });
    const dups = rows.filter((r) => r.duplicate).length;
    const body =
      '<p class="muted">Confira as categorias sugeridas antes de importar: o app lembra o que você escolher para cada favorecido nas próximas importações. Movimentações entre a conta e seus investimentos (ex.: BB Rende Fácil, poupança, Tesouro) vêm desmarcadas porque não são receita nem despesa.</p>' +
      (cardRows
        ? '<p class="muted"><strong>Pagamento de fatura desmarcado:</strong> você importa as faturas do cartão com as compras detalhadas, então o pagamento da fatura na conta não conta de novo como despesa.</p>'
        : '') +
      '<div class="kpi-row" style="margin:0 0 12px;padding:0;border:0">' +
      kpi('Entradas', '<span class="pos" id="st-inc"></span>') +
      kpi('Saídas', '<span class="neg" id="st-exp"></span>') +
      kpi('Investimentos (desmarcados)', String(skipped.investment)) +
      kpi('Linhas de saldo ignoradas', String(skipped.balance)) +
      (dups ? kpi('Já importados', String(dups)) : '') +
      '</div>' +
      previewTable(rows);
    openModal({
      title: 'Importar extrato (' + rows.length + ' lançamentos)',
      wide: true,
      body,
      actions: [
        { label: 'Cancelar', onClick: (c) => c() },
        {
          label: 'Importar selecionados',
          cls: 'primary',
          onClick: (close, form) => {
            readPreview(form, rows);
            const res = P.statement.importRows(store, rows);
            finishImport(close, rows, res.added + ' lançamento(s) importado(s)' + (res.duplicates ? ', ' + res.duplicates + ' já existiam' : '') + '.');
          },
        },
      ],
      onOpen: (form) => bindPreviewTotals(form, rows),
    });
  }

  function finishImport(close, rows, message) {
    const last = rows.filter((r) => r.include).map((r) => r.date).sort().pop();
    if (last) state.cashMonth = U.monthKey(last);
    close();
    if (state.view !== 'cashflow') go('cashflow');
    toast(message);
  }

  function pickPdf(handler) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => handler(reader.result, file.name);
      reader.readAsArrayBuffer(file);
    });
    document.body.appendChild(input);
    input.click();
  }

  async function openInvoicePreview(buffer) {
    toast('Lendo a fatura…');
    let parsed;
    try {
      const text = await P.invoice.extractText(buffer);
      parsed = P.invoice.parseText(text);
      if (!parsed.rows.length) throw new Error('Não encontrei lançamentos nesta fatura. O leitor foi feito para a fatura Ourocard (BB) em PDF.');
    } catch (e) {
      return openModal({ title: 'Não foi possível ler a fatura', body: '<p>' + esc(e.message || e) + '</p>' });
    }
    const { info, rows } = parsed;
    markKnown(rows);
    const payments = P.invoice.findCardPayments(store, parsed);
    const dups = rows.filter((r) => r.duplicate).length;
    const body =
      '<p class="muted">As compras da fatura são distribuídas nas categorias de despesa. Para não contar o mesmo gasto duas vezes, <strong>o pagamento da fatura deixa de ser despesa</strong>: quem conta são as compras detalhadas. Parcelas entram no mês desta fatura; estornos que anulam uma cobrança vêm desmarcados.</p>' +
      '<div class="kpi-row" style="margin:0 0 12px;padding:0;border:0">' +
      kpi('Cartão', esc(info.issuer + (info.card ? ' final ' + info.card : ''))) +
      kpi('Fechamento', info.closing ? U.fmtDate(info.closing) : '—') +
      (info.due ? kpi('Vencimento', U.fmtDate(info.due)) : '') +
      kpi('Total da fatura', info.total !== null ? U.money(info.total) : '—') +
      kpi('Selecionado', '<span id="inv-sel"></span>') +
      (dups ? kpi('Já importados', String(dups)) : '') +
      '</div>' +
      (payments.length
        ? '<div class="card" style="margin-bottom:12px;background:var(--surface-2)"><strong>Pagamentos de fatura já lançados pelo extrato</strong>' +
          '<div class="faint" style="margin-bottom:6px">Marque para remover do Orçamento. Os que batem com o valor desta fatura ou do saldo anterior já vêm marcados.</div>' +
          payments
            .map(
              (p) =>
                '<label class="check" style="margin:4px 0"><input type="checkbox" data-remove-pay="' + p.tx.id + '"' + (p.suggested ? ' checked' : '') + '> ' +
                U.fmtDate(p.tx.date) + ' · ' + esc(p.tx.note || 'Fatura do cartão') + ' · <strong class="num">' + U.money(p.tx.amount) + '</strong></label>'
            )
            .join('') +
          '</div>'
        : '') +
      previewTable(rows);
    openModal({
      title: 'Importar fatura (' + rows.filter((r) => r.kind === 'purchase').length + ' compras)',
      wide: true,
      body,
      actions: [
        { label: 'Cancelar', onClick: (c) => c() },
        {
          label: 'Importar selecionados',
          cls: 'primary',
          onClick: (close, form) => {
            readPreview(form, rows);
            const remove = $$('[data-remove-pay]', form).filter((el) => el.checked).map((el) => el.dataset.removePay);
            const res = P.invoice.importRows(store, rows, remove);
            finishImport(
              close,
              rows,
              res.added + ' lançamento(s) da fatura importado(s)' + (res.removed ? ', ' + res.removed + ' pagamento(s) de fatura removido(s)' : '') + (res.duplicates ? ', ' + res.duplicates + ' já existiam' : '') + '.'
            );
          },
        },
      ],
      onOpen: (form) =>
        bindPreviewTotals(form, rows, (inc, exp) => {
          const sel = exp - inc;
          const el = $('#inv-sel', form);
          const ok = info.total !== null && Math.abs(sel - info.total) < 0.01;
          el.innerHTML = U.money(sel) + (info.total !== null ? (ok ? ' <span class="pos" title="Confere com o total da fatura">✓</span>' : ' <span class="neg" title="Diferente do total da fatura">≠</span>') : '');
        }),
    });
  }

  async function importJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return openModal({ title: 'Arquivo inválido', body: '<p>Esse arquivo não é um backup do Patrimônio.</p>' });
    }
    if (!parsed || !Array.isArray(parsed.assets)) return openModal({ title: 'Arquivo inválido', body: '<p>Esse arquivo não é um backup do Patrimônio.</p>' });
    const ok = await confirmDialog('Restaurar backup?', 'Os dados atuais serão substituídos pelos do arquivo (' + parsed.assets.length + ' investimentos).', 'Restaurar', true);
    if (!ok) return;
    store.replaceAll(parsed);
    toast('Backup restaurado.');
  }

  function exportFile(name, content) {
    store.backend
      .saveFile(name, content)
      .then((res) => {
        if (res && res.url) {
          openModal({ title: 'Arquivo exportado', body: '<p>' + esc(res.message) + '</p><p><a class="btn primary" href="' + esc(res.url) + '" target="_blank" rel="noopener">Abrir no Google Drive</a></p>' });
        } else if (res && res.message) toast(res.message);
      })
      .catch((e) => toast('Erro ao exportar: ' + (e.message || e)));
  }

  function openCsvHelp() {
    openModal({
      title: 'Como preparar sua planilha',
      wide: true,
      body:
        '<p>No Excel use <strong>Arquivo › Salvar como › CSV</strong>. No Google Planilhas, <strong>Arquivo › Fazer download › CSV</strong>.</p>' +
        '<h3 class="card-title" style="margin-top:14px">Formato 1 — saldos por mês</h3><p class="muted">Uma linha por investimento e uma coluna por mês. É o formato mais comum de planilha de patrimônio. O primeiro saldo de cada investimento é considerado aporte inicial.</p>' +
        '<pre class="code">' + esc(P.csv.TEMPLATE_MONTHS) + '</pre><button class="btn small" data-action="download-template" data-id="meses">Baixar modelo</button>' +
        '<h3 class="card-title" style="margin-top:18px">Formato 2 — lançamentos</h3><p class="muted">Uma linha por data e investimento, com aportes, resgates e proventos, para uma rentabilidade exata.</p>' +
        '<pre class="code">' + esc(P.csv.TEMPLATE_ROWS) + '</pre><button class="btn small" data-action="download-template" data-id="lancamentos">Baixar modelo</button>' +
        '<h3 class="card-title" style="margin-top:18px">Regras</h3><ul class="muted">' +
        '<li>Separador ponto e vírgula (;), vírgula ou tab.</li>' +
        '<li>Datas: 31/01/2026 ou 2026-01-31. No formato 1: 01/2026, jan/26 ou Janeiro 2026.</li>' +
        '<li>Valores: 1.234,56 ou 1234.56, com ou sem R$.</li>' +
        '<li>Colunas reconhecidas: data, instituição/banco/corretora, ativo/investimento, classe/tipo, saldo/valor, aporte, resgate, proventos, ticker.</li>' +
        '<li>Se a classe não for informada, o app tenta adivinhar pelo nome (CDB, Tesouro, FII…).</li>' +
        '<li>Importar de novo o mesmo mês substitui o saldo, sem duplicar.</li></ul>',
    });
  }

  // =====================================================================
  // Modais e formulários
  // =====================================================================

  function openModal(opts) {
    const root = $('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    const actions = opts.actions || [{ label: 'OK', cls: 'primary', onClick: (close) => close() }];
    wrap.innerHTML =
      '<form class="modal' + (opts.wide ? ' wide' : '') + '" novalidate>' +
      '<div class="modal-head"><h2>' + esc(opts.title) + '</h2><button type="button" class="icon-btn" data-close aria-label="Fechar">×</button></div>' +
      '<div class="modal-body">' + opts.body + '</div>' +
      '<div class="modal-foot">' +
      actions.map((a, i) => '<button type="' + (a.submit ? 'submit' : 'button') + '" class="btn ' + (a.cls || '') + (a.left ? ' left' : '') + '" data-act="' + i + '">' + esc(a.label) + '</button>').join('') +
      '</div></form>';
    root.appendChild(wrap);
    const form = $('form', wrap);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => e.target === wrap && close());
    $('[data-close]', wrap).addEventListener('click', close);
    actions.forEach((a, i) => {
      if (a.submit) return;
      $('[data-act="' + i + '"]', wrap).addEventListener('click', () => (a.onClick ? a.onClick(close, form) : close()));
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const a = actions.find((x) => x.submit);
      if (a) a.onClick(close, form);
    });
    if (opts.onOpen) opts.onOpen(form, close);
    const focusable = $('input:not([type=hidden]), select, textarea', form);
    if (focusable) setTimeout(() => focusable.focus(), 30);
    return close;
  }

  function confirmDialog(title, message, okLabel, danger) {
    return new Promise((resolve) => {
      let result = false;
      openModal({
        title,
        body: '<p>' + esc(message) + '</p>',
        onClose: () => resolve(result),
        actions: [
          { label: 'Cancelar', onClick: (c) => c() },
          { label: okLabel || 'OK', cls: danger ? 'danger' : 'primary', onClick: (c) => ((result = true), c()) },
        ],
      });
    });
  }

  function field(label, input, hint) {
    return '<div class="field"><label>' + esc(label) + '</label>' + input + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  }
  const val = (form, name) => {
    const el = form.elements[name];
    return el ? el.value.trim() : '';
  };

  function institutionOptions(selected) {
    return (
      '<option value="">Selecione…</option>' +
      store.data.institutions
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((i) => '<option value="' + i.id + '"' + (i.id === selected ? ' selected' : '') + '>' + esc(i.name) + '</option>')
        .join('') +
      '<option value="__new">+ Nova instituição…</option>'
    );
  }

  function openAssetForm(asset) {
    const isNew = !asset;
    const a = asset || { name: '', classId: 'rendaFixa', institutionId: store.data.institutions.length === 1 ? store.data.institutions[0].id : '', ticker: '', indexer: '', maturity: null, notes: '' };
    const body =
      field('Nome do investimento', '<input type="text" name="name" required placeholder="Ex.: CDB Banco X 2027" value="' + esc(a.name) + '">') +
      '<div class="form-row">' +
      field('Classe', '<select name="classId">' + P.ASSET_CLASSES.map((c) => '<option value="' + c.id + '"' + (c.id === a.classId ? ' selected' : '') + '>' + esc(c.title) + '</option>').join('') + '</select>', '<span id="class-hint">' + esc(P.classById(a.classId).examples) + '</span>') +
      field('Instituição', '<select name="institutionId">' + institutionOptions(a.institutionId) + '</select><input type="text" name="newInstitution" placeholder="Nome do banco ou corretora" style="display:none;margin-top:6px">') +
      '</div>' +
      (isNew
        ? '<div class="form-row">' + field('Saldo atual (R$)', '<input class="money-input" inputmode="decimal" name="initialValue" placeholder="0,00">', 'Registrado como aporte inicial.') + field('Data do saldo', '<input type="date" name="initialDate" value="' + U.today() + '">') + '</div>'
        : '') +
      '<div class="form-row">' +
      field('Indexador (opcional)', '<input type="text" name="indexer" placeholder="110% CDI, IPCA + 6%" value="' + esc(a.indexer) + '">') +
      field('Código / ticker (opcional)', '<input type="text" name="ticker" placeholder="PETR4" value="' + esc(a.ticker) + '">') +
      '</div>' +
      field('Vencimento (opcional)', '<input type="date" name="maturity" value="' + (a.maturity || '') + '">') +
      field('Observações', '<textarea name="notes" rows="2">' + esc(a.notes) + '</textarea>');

    openModal({
      title: isNew ? 'Novo investimento' : 'Editar investimento',
      body,
      actions: [
        { label: 'Cancelar', onClick: (c) => c() },
        {
          label: 'Salvar',
          cls: 'primary',
          submit: true,
          onClick: (close, form) => {
            const name = val(form, 'name');
            if (!name) return form.elements.name.focus();
            let institutionId = val(form, 'institutionId');
            if (institutionId === '__new') {
              const n = val(form, 'newInstitution');
              if (!n) return form.elements.newInstitution.focus();
              institutionId = store.findOrCreateInstitution(n, false).inst.id;
            }
            const payload = { id: asset ? asset.id : undefined, name, classId: val(form, 'classId'), institutionId, ticker: val(form, 'ticker'), indexer: val(form, 'indexer'), maturity: val(form, 'maturity') || null, notes: val(form, 'notes') };
            const saved = store.saveAsset(payload, isNew ? U.parseNumber(val(form, 'initialValue')) : 0, isNew ? val(form, 'initialDate') || U.today() : null);
            close();
            toast(isNew ? 'Investimento adicionado.' : 'Alterações salvas.');
            if (isNew && state.view === 'dashboard') return;
            if (isNew) go('asset', saved.id);
          },
        },
      ],
      onOpen: (form) => {
        const sel = form.elements.institutionId;
        const toggle = () => (form.elements.newInstitution.style.display = sel.value === '__new' ? 'block' : 'none');
        sel.addEventListener('change', () => {
          toggle();
          if (sel.value === '__new') form.elements.newInstitution.focus();
        });
        if (!store.data.institutions.length) {
          sel.value = '__new';
          toggle();
        }
        form.elements.classId.addEventListener('change', () => ($('#class-hint').textContent = P.classById(form.elements.classId.value).examples));
      },
    });
  }

  function openInstitutionForm(inst) {
    const isNew = !inst;
    const used = new Set(store.data.institutions.map((i) => U.norm(i.name)));
    const color = inst ? inst.color : P.PALETTE[store.data.institutions.length % P.PALETTE.length];
    const presets = P.INSTITUTION_PRESETS.filter((p) => !used.has(U.norm(p.name)));
    openModal({
      title: isNew ? 'Nova instituição' : 'Editar instituição',
      body:
        '<div class="form-row" style="grid-template-columns:1fr 90px">' +
        field('Nome', '<input type="text" name="name" required placeholder="Nome do banco ou corretora" value="' + esc(inst ? inst.name : '') + '">') +
        field('Cor', '<input type="color" name="color" value="' + esc(color) + '" style="height:40px;width:100%;padding:2px">') +
        '</div>' +
        (isNew && presets.length ? '<div class="field"><label>Sugestões</label><div class="chips">' + presets.map((p) => '<button type="button" class="chip" data-preset="' + esc(p.name) + '" data-color="' + p.color + '"><i class="dot" style="background:' + p.color + '"></i>' + esc(p.name) + '</button>').join('') + '</div></div>' : ''),
      actions: [
        { label: 'Cancelar', onClick: (c) => c() },
        {
          label: 'Salvar',
          cls: 'primary',
          submit: true,
          onClick: (close, form) => {
            const name = val(form, 'name');
            if (!name) return form.elements.name.focus();
            store.saveInstitution({ id: inst ? inst.id : undefined, name, color: form.elements.color.value.toUpperCase() });
            close();
          },
        },
      ],
      onOpen: (form) => {
        $$('[data-preset]', form).forEach((b) =>
          b.addEventListener('click', () => {
            form.elements.name.value = b.dataset.preset;
            form.elements.color.value = b.dataset.color.toLowerCase();
          })
        );
      },
    });
  }

  function openQuickUpdate(asset) {
    openModal({
      title: asset.name,
      body:
        field('Data', '<input type="date" name="date" value="' + U.today() + '">') +
        field('Novo saldo (R$)', '<input class="money-input" inputmode="decimal" name="balance" placeholder="' + esc(U.editable(store.currentValue(asset.id))) + '">', 'Último saldo: ' + U.money(store.currentValue(asset.id)) + '. Deixe vazio para registrar só a movimentação.') +
        '<div class="form-row">' +
        field('Movimentação (opcional)', '<select name="kind">' + P.MOVEMENT_KINDS.map((k) => '<option value="' + k.id + '">' + k.title + '</option>').join('') + '</select>') +
        field('Valor (R$)', '<input class="money-input" inputmode="decimal" name="amount" placeholder="0,00">') +
        '</div>' +
        field('Observação', '<input type="text" name="note">') +
        '<label class="check"><input type="checkbox" name="addToBalance"> Somar o aporte ao último saldo (quando não souber o saldo novo)</label>',
      actions: [
        { label: 'Cancelar', onClick: (c) => c() },
        {
          label: 'Salvar',
          cls: 'primary',
          submit: true,
          onClick: (close, form) => {
            const date = val(form, 'date') || U.today();
            let bal = U.parseNumber(val(form, 'balance'));
            const amt = U.parseNumber(val(form, 'amount'));
            const kind = val(form, 'kind');
            if (bal === null && form.elements.addToBalance.checked && amt > 0) {
              bal = store.currentValue(asset.id) + (kind === 'aporte' ? amt : kind === 'resgate' ? -amt : 0);
            }
            if (bal === null && !(amt > 0)) return form.elements.balance.focus();
            if (bal !== null) store.recordBalance(asset.id, date, bal, false);
            if (amt > 0) store.recordMovement(asset.id, kind, Math.abs(amt), date, val(form, 'note'), false);
            store.commit();
            close();
            toast('Investimento atualizado.');
          },
        },
      ],
    });
  }

  /** <option>s de categoria com subcategorias recuadas. `allowNew` adiciona "+ Nova categoria…". */
  function categoryOptions(income, selected, allowNew) {
    return (
      P.categoriesFor(income)
        .map((c) => '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + (c.depth ? '   ↳ ' : '') + esc(c.title) + '</option>')
        .join('') + (allowNew ? '<option value="__new">+ Nova categoria…</option>' : '')
    );
  }

  /** Liga a opção "+ Nova categoria…" de um <select> ao formulário de categoria. */
  function bindNewCategory(select, getIncome) {
    let previous = select.value;
    select.addEventListener('focus', () => (previous = select.value));
    select.addEventListener('change', () => {
      if (select.value !== '__new') return (previous = select.value);
      select.value = previous;
      const parent = P.categoryById(previous);
      openCategoryForm(null, { income: getIncome(), parentId: null, suggestParent: parent && !parent.parentId ? parent.id : null }, (saved) => {
        select.innerHTML = categoryOptions(saved.income, saved.id, true);
        previous = saved.id;
      });
    });
  }

  /** Criar/editar categoria ou subcategoria. `defaults`: { income, parentId, suggestParent } */
  function openCategoryForm(cat, defaults, onSaved) {
    defaults = defaults || {};
    const isNew = !cat;
    const income = cat ? cat.income : !!defaults.income;
    const parentId = cat ? cat.parentId : defaults.parentId || null;
    const hasSubs = cat && P.subcategoriesOf(cat.id).length > 0;
    const parentOptions = (inc, sel) =>
      '<option value="">Nenhuma — é uma categoria principal</option>' +
      P.topCategories(inc)
        .filter((c) => !cat || c.id !== cat.id)
        .map((c) => '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.title) + '</option>')
        .join('');
    const color = cat ? cat.color : parentId ? P.categoryById(parentId).color : P.PALETTE[P.customCategories().length % P.PALETTE.length];
    openModal({
      title: isNew ? (parentId ? 'Nova subcategoria' : 'Nova categoria') : 'Editar categoria',
      body:
        '<div class="field"><label>Tipo</label><div class="seg" id="cat-type"><button type="button" data-inc="0" class="' + (!income ? 'on' : '') + '">Despesa</button><button type="button" data-inc="1" class="' + (income ? 'on' : '') + '">Receita</button></div></div>' +
        '<div class="form-row" style="grid-template-columns:1fr 90px">' +
        field('Nome', '<input type="text" name="title" required placeholder="Ex.: Condomínio, Academia, Filhos" value="' + esc(cat ? cat.title : '') + '">') +
        field('Cor', '<input type="color" name="color" value="' + esc(color) + '" style="height:40px;width:100%;padding:2px">') +
        '</div>' +
        field(
          'Dentro de (opcional)',
          '<select name="parentId"' + (hasSubs ? ' disabled' : '') + '>' + parentOptions(income, parentId || (isNew ? '' : '')) + '</select>',
          hasSubs ? 'Esta categoria tem subcategorias, por isso continua sendo principal.' : 'Escolha uma categoria para criar uma <strong>subcategoria</strong> (ex.: Moradia › Condomínio).'
        ) +
        (isNew && defaults.suggestParent && !parentId
          ? '<p class="faint">Dica: para criar uma subcategoria de <strong>' + esc(P.categoryById(defaults.suggestParent).title) + '</strong>, escolha-a em "Dentro de".</p>'
          : ''),
      actions: [
        { label: 'Cancelar', onClick: (c) => c() },
        {
          label: 'Salvar',
          cls: 'primary',
          submit: true,
          onClick: (close, form) => {
            try {
              const inc = $('#cat-type .on', form).dataset.inc === '1';
              const saved = store.saveCategory({ id: cat ? cat.id : undefined, title: val(form, 'title'), income: inc, color: form.elements.color.value.toUpperCase(), parentId: hasSubs ? null : val(form, 'parentId') || null });
              close();
              toast(isNew ? 'Categoria criada.' : 'Categoria atualizada.');
              if (onSaved) onSaved(saved);
            } catch (e) {
              toast(e.message);
            }
          },
        },
      ],
      onOpen: (form) => {
        $$('#cat-type button', form).forEach((b) =>
          b.addEventListener('click', () => {
            $$('#cat-type button', form).forEach((x) => x.classList.toggle('on', x === b));
            form.elements.parentId.innerHTML = parentOptions(b.dataset.inc === '1', '');
          })
        );
        form.elements.parentId.addEventListener('change', () => {
          const p = form.elements.parentId.value;
          if (p && isNew) form.elements.color.value = P.categoryById(p).color.toLowerCase();
        });
      },
    });
  }

  async function confirmDeleteCategory(cat) {
    const used = store.categoryUsage(cat.id);
    const subs = P.subcategoriesOf(cat.id);
    const fallback = cat.parentId || (cat.income ? 'outrasReceitas' : 'outrosGastos');
    openModal({
      title: 'Excluir ' + P.categoryLabel(cat.id) + '?',
      body:
        (subs.length ? '<p>As ' + subs.length + ' subcategoria(s) também serão excluídas.</p>' : '') +
        (used
          ? '<p>' + used + ' lançamento(s) usam esta categoria. Para onde eles vão?</p>' +
            field('Mover lançamentos para', '<select name="moveTo">' + P.categoriesFor(cat.income).filter((c) => c.id !== cat.id && c.parentId !== cat.id).map((c) => '<option value="' + c.id + '"' + (c.id === fallback ? ' selected' : '') + '>' + (c.depth ? '   ↳ ' : '') + esc(c.title) + '</option>').join('') + '</select>')
          : '<p class="muted">Nenhum lançamento usa esta categoria.</p>'),
      actions: [
        { label: 'Cancelar', onClick: (c) => c() },
        {
          label: 'Excluir',
          cls: 'danger',
          onClick: (close, form) => {
            const moveTo = form.elements.moveTo ? form.elements.moveTo.value : fallback;
            if (state.cashCategory && P.inCategory(state.cashCategory, cat.id)) state.cashCategory = null;
            const moved = store.deleteCategory(cat.id, moveTo);
            close();
            toast('Categoria excluída' + (moved ? '; ' + moved + ' lançamento(s) movido(s) para ' + P.categoryLabel(moveTo) : '') + '.');
          },
        },
      ],
    });
  }

  function categoriesCard() {
    const block = (income) =>
      '<div class="group-head" style="margin-top:8px">' + (income ? 'Receitas' : 'Despesas') + '<button class="btn small" data-action="new-category" data-id="' + (income ? 'income' : 'expense') + '">+ Categoria</button></div><div class="list">' +
      P.topCategories(income)
        .map((c) => {
          const subs = P.subcategoriesOf(c.id);
          return (
            '<div class="row cat-manage"><i class="dot" style="background:' + c.color + '"></i><div class="grow"><div class="title">' + esc(c.title) + (c.builtin ? '' : ' <span class="tag">sua</span>') + '</div>' +
            (subs.length
              ? '<div class="sub-list">' +
                subs.map((sc) => '<span class="chip sub-chip"><i class="dot" style="background:' + sc.color + '"></i>' + esc(sc.title) + '<button class="linklike" title="Editar" data-action="edit-category" data-id="' + sc.id + '">✎</button><button class="linklike" title="Excluir" data-action="delete-category" data-id="' + sc.id + '">×</button></span>').join('') +
                '</div>'
              : '') +
            '</div><button class="btn small ghost" data-action="new-subcategory" data-id="' + c.id + '">+ Subcategoria</button>' +
            (c.builtin ? '' : '<button class="btn small" data-action="edit-category" data-id="' + c.id + '">Editar</button><button class="icon-btn" title="Excluir" data-action="delete-category" data-id="' + c.id + '">×</button>') +
            '</div>'
          );
        })
        .join('') +
      '</div>';
    return (
      '<section class="card span-12" id="categories"><div class="card-head"><div><h3 class="card-title">Categorias do orçamento</h3><div class="card-sub">Crie categorias e subcategorias (ex.: Moradia › Condomínio). As categorias padrão não podem ser excluídas, mas aceitam subcategorias.</div></div></div>' +
      '<div class="grid"><div class="span-6">' + block(false) + '</div><div class="span-6">' + block(true) + '</div></div></section>'
    );
  }

  function openTransactionForm(tx, income) {
    const isNew = !tx;
    const t = tx || { date: U.monthKey(U.today()) === state.cashMonth ? U.today() : state.cashMonth + '-01', amount: '', category: income ? 'salario' : 'mercado', note: '' };
    const catOptions = (inc, sel) => categoryOptions(inc, sel, true);
    let currentIncome = income;
    const actions = [];
    if (!isNew) {
      actions.push({
        label: 'Excluir',
        cls: 'danger',
        left: true,
        onClick: (close) => {
          store.deleteTransaction(tx.id);
          close();
        },
      });
    }
    actions.push({ label: 'Cancelar', onClick: (c) => c() });
    actions.push({
      label: 'Salvar',
      cls: 'primary',
      submit: true,
      onClick: (close, form) => {
        const amount = U.parseNumber(val(form, 'amount'));
        if (!(amount > 0)) return form.elements.amount.focus();
        if (val(form, 'category') === '__new') return form.elements.category.focus();
        store.saveTransaction({ id: tx ? tx.id : undefined, date: val(form, 'date') || U.today(), amount: Math.abs(amount), category: val(form, 'category'), note: val(form, 'note') });
        close();
      },
    });
    openModal({
      title: isNew ? (income ? 'Nova receita' : 'Nova despesa') : 'Editar lançamento',
      body:
        '<div class="field"><label>Tipo</label><div class="seg" id="tx-type"><button type="button" data-inc="0" class="' + (!income ? 'on' : '') + '">Despesa</button><button type="button" data-inc="1" class="' + (income ? 'on' : '') + '">Receita</button></div></div>' +
        '<div class="form-row">' + field('Valor (R$)', '<input class="money-input" inputmode="decimal" name="amount" placeholder="0,00" value="' + esc(tx ? U.editable(tx.amount) : '') + '">') + field('Data', '<input type="date" name="date" value="' + t.date + '">') + '</div>' +
        field('Categoria', '<select name="category">' + catOptions(income, t.category) + '</select>') +
        field('Descrição', '<input type="text" name="note" value="' + esc(t.note) + '">'),
      actions,
      onOpen: (form) => {
        $$('#tx-type button', form).forEach((b) =>
          b.addEventListener('click', () => {
            const inc = b.dataset.inc === '1';
            currentIncome = inc;
            $$('#tx-type button', form).forEach((x) => x.classList.toggle('on', x === b));
            form.elements.category.innerHTML = catOptions(inc, inc ? 'salario' : 'mercado');
            $('.modal-head h2', form).textContent = isNew ? (inc ? 'Nova receita' : 'Nova despesa') : 'Editar lançamento';
          })
        );
        bindNewCategory(form.elements.category, () => currentIncome);
      },
    });
  }

  P.app = { init, state, get store() { return store; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);

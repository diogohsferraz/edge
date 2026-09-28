/* Catálogos (classes, categorias, bancos) e o armazenamento dos dados. */
(function (g) {
  'use strict';
  const P = (g.Patrimonio = g.Patrimonio || {});
  const U = P.util;

  P.ASSET_CLASSES = [
    { id: 'conta', title: 'Conta e Poupança', color: '#8E8E93', examples: 'Conta remunerada, poupança, caixinhas' },
    { id: 'rendaFixa', title: 'Renda Fixa', color: '#0A84FF', examples: 'CDB, LCI, LCA, LC, Debêntures, CRI/CRA' },
    { id: 'tesouro', title: 'Tesouro Direto', color: '#30B0C7', examples: 'Selic, IPCA+, Prefixado' },
    { id: 'acoes', title: 'Ações', color: '#34C759', examples: 'Ações da B3, ETFs' },
    { id: 'fiis', title: 'Fundos Imobiliários', color: '#FF9F0A', examples: 'FIIs e Fiagros' },
    { id: 'fundos', title: 'Fundos de Investimento', color: '#AF52DE', examples: 'Multimercado, DI, Ações' },
    { id: 'previdencia', title: 'Previdência', color: '#5E5CE6', examples: 'PGBL, VGBL' },
    { id: 'cripto', title: 'Criptomoedas', color: '#E6B800', examples: 'Bitcoin, Ethereum, stablecoins' },
    { id: 'exterior', title: 'Exterior', color: '#FF375F', examples: 'Stocks, REITs, BDRs' },
    { id: 'outros', title: 'Outros', color: '#A2845E', examples: 'Imóveis, COE, outros' },
  ];
  P.classById = function (id) {
    return P.ASSET_CLASSES.find((c) => c.id === id) || P.ASSET_CLASSES[P.ASSET_CLASSES.length - 1];
  };

  /** Reconhece a classe a partir de texto livre (importação de planilhas). */
  P.matchClass = function (text) {
    const t = U.norm(text);
    if (!t) return 'outros';
    const exact = P.ASSET_CLASSES.find((c) => c.id === text || U.norm(c.title) === t);
    if (exact) return exact.id;
    const rules = [
      ['tesouro', ['tesouro', 'selic', 'ntn', 'ltn']],
      ['fiis', ['fii', 'imobiliario', 'fiagro']],
      ['previdencia', ['previdencia', 'pgbl', 'vgbl']],
      ['cripto', ['cripto', 'bitcoin', 'btc', 'eth', 'crypto']],
      ['exterior', ['exterior', 'stock', 'reit', 'internacional', 'dolar', 'usd', 'bdr']],
      ['fundos', ['fundo', 'multimercado', 'fic', 'fim']],
      ['rendaFixa', ['renda fixa', 'cdb', 'lci', 'lca', 'debenture', 'cri', 'cra', 'rdb']],
      ['acoes', ['acao', 'acoes', 'etf', 'bolsa', 'renda variavel']],
      ['conta', ['conta', 'poupanca', 'caixinha', 'saldo', 'cofrinho']],
    ];
    for (const [id, keys] of rules) {
      if (keys.some((k) => t.includes(k))) return id;
    }
    return 'outros';
  };

  P.MOVEMENT_KINDS = [
    { id: 'aporte', title: 'Aporte', color: '#34C759', flowSign: 1, investedSign: 1 },
    { id: 'resgate', title: 'Resgate', color: '#FF3B30', flowSign: -1, investedSign: -1 },
    { id: 'provento', title: 'Provento', color: '#FF9F0A', flowSign: -1, investedSign: 0 },
  ];
  P.kindById = function (id) {
    return P.MOVEMENT_KINDS.find((k) => k.id === id) || P.MOVEMENT_KINDS[0];
  };

  P.CASH_CATEGORIES = [
    { id: 'salario', title: 'Salário', income: true, color: '#34C759' },
    { id: 'freelance', title: 'Freelance / Extra', income: true, color: '#30D158' },
    { id: 'rendimentos', title: 'Rendimentos', income: true, color: '#00C7BE' },
    { id: 'outrasReceitas', title: 'Outras receitas', income: true, color: '#64D2FF' },
    { id: 'moradia', title: 'Moradia', income: false, color: '#0A84FF' },
    { id: 'mercado', title: 'Mercado', income: false, color: '#FF9F0A' },
    { id: 'alimentacao', title: 'Restaurantes', income: false, color: '#FF6B35' },
    { id: 'transporte', title: 'Transporte', income: false, color: '#5E5CE6' },
    { id: 'saude', title: 'Saúde', income: false, color: '#FF375F' },
    { id: 'educacao', title: 'Educação', income: false, color: '#BF5AF2' },
    { id: 'lazer', title: 'Lazer', income: false, color: '#E6B800' },
    { id: 'compras', title: 'Compras', income: false, color: '#FF2D55' },
    { id: 'assinaturas', title: 'Assinaturas', income: false, color: '#AC8E68' },
    { id: 'contas', title: 'Contas da casa', income: false, color: '#30B0C7' },
    { id: 'viagem', title: 'Viagem', income: false, color: '#66D4CF' },
    { id: 'cartao', title: 'Fatura do cartão', income: false, color: '#1C1C1E' },
    { id: 'impostos', title: 'Impostos e taxas', income: false, color: '#8E8E93' },
    { id: 'pets', title: 'Pets', income: false, color: '#A2845E' },
    { id: 'outrosGastos', title: 'Outros gastos', income: false, color: '#636366' },
  ];
  P.CASH_CATEGORIES.forEach((c) => {
    c.builtin = true;
    c.parentId = null;
  });

  // Categorias e subcategorias criadas pelo usuário (ficam em data.customCategories).
  let customCategories = [];
  P.setCustomCategories = function (list) {
    customCategories = list || [];
  };
  P.customCategories = function () {
    return customCategories;
  };

  P.categoryById = function (id) {
    return (
      P.CASH_CATEGORIES.find((c) => c.id === id) ||
      customCategories.find((c) => c.id === id) ||
      P.CASH_CATEGORIES[P.CASH_CATEGORIES.length - 1]
    );
  };

  P.categoryExists = function (id) {
    return P.CASH_CATEGORIES.some((c) => c.id === id) || customCategories.some((c) => c.id === id);
  };

  /** Categorias principais (sem pai) de um tipo, na ordem: padrão e depois as criadas. */
  P.topCategories = function (income) {
    return P.CASH_CATEGORIES.filter((c) => c.income === income).concat(customCategories.filter((c) => c.income === income && !c.parentId));
  };

  P.subcategoriesOf = function (id) {
    return customCategories.filter((c) => c.parentId === id);
  };

  /** Lista plana para seletores: cada categoria seguida das suas subcategorias. */
  P.categoriesFor = function (income) {
    const out = [];
    P.topCategories(income).forEach((c) => {
      out.push(Object.assign({ depth: 0 }, c));
      P.subcategoriesOf(c.id).forEach((s) => out.push(Object.assign({ depth: 1 }, s)));
    });
    return out;
  };

  /** Categoria principal de uma subcategoria (ou a própria categoria). */
  P.rootCategory = function (id) {
    const c = P.categoryById(id);
    return c.parentId ? P.categoryById(c.parentId) : c;
  };

  /** "Moradia › Condomínio" */
  P.categoryLabel = function (id) {
    const c = P.categoryById(id);
    return c.parentId ? P.categoryById(c.parentId).title + ' › ' + c.title : c.title;
  };

  /** O lançamento da categoria `catId` pertence ao filtro `filterId` (inclui subcategorias)? */
  P.inCategory = function (catId, filterId) {
    return catId === filterId || P.categoryById(catId).parentId === filterId;
  };

  P.INSTITUTION_PRESETS = [
    ['Nubank', '#820AD1'], ['Itaú', '#EC7000'], ['Bradesco', '#CC092F'], ['Banco do Brasil', '#D4A900'],
    ['Caixa', '#005CA9'], ['Santander', '#EC0000'], ['Inter', '#FF7A00'], ['C6 Bank', '#3A3A3C'],
    ['XP Investimentos', '#1C1C1E'], ['BTG Pactual', '#0D2B5C'], ['Rico', '#FF5A00'], ['Clear', '#00A3E0'],
    ['NuInvest', '#9B4DCA'], ['Mercado Pago', '#00B1EA'], ['PicPay', '#21C25E'], ['Sicredi', '#3FA110'],
    ['Sicoob', '#003641'], ['Banco Pan', '#00AEEF'], ['Órama', '#1E9E8A'], ['Warren', '#E02B57'],
    ['Avenue', '#1D3CB5'], ['Binance', '#D4A20B'], ['Tesouro Direto', '#2E7D32'],
  ].map(([name, color]) => ({ name, color }));

  P.PALETTE = ['#5E5CE6', '#0A84FF', '#30B0C7', '#34C759', '#FF9F0A', '#FF375F', '#AF52DE', '#A2845E'];

  // ---------------------------------------------------------------------
  // Armazenamento
  // ---------------------------------------------------------------------

  P.emptyData = function () {
    return {
      version: 1,
      institutions: [],
      assets: [],
      snapshots: [],
      movements: [],
      transactions: [],
      customCategories: [],
      settings: { goal: 0, hideValues: false, categoryRules: {} },
      benchmarks: { cdi: {}, ipca: {}, updated: null },
    };
  };

  /** Garante a estrutura esperada (dados antigos, importados ou vindos da planilha). */
  P.normalizeData = function (raw) {
    const d = P.emptyData();
    if (!raw || typeof raw !== 'object') return d;
    const num = (v) => U.parseNumber(v) || 0;
    const str = (v) => (v === null || v === undefined ? '' : String(v));
    const date = (v) => (U.isISO(str(v).slice(0, 10)) ? str(v).slice(0, 10) : null);

    d.institutions = (raw.institutions || [])
      .filter((i) => i && i.id)
      .map((i) => ({ id: str(i.id), name: str(i.name) || 'Sem nome', color: str(i.color) || '#8E8E93' }));
    d.assets = (raw.assets || [])
      .filter((a) => a && a.id)
      .map((a) => ({
        id: str(a.id),
        name: str(a.name) || 'Sem nome',
        classId: P.ASSET_CLASSES.some((c) => c.id === a.classId) ? a.classId : 'outros',
        institutionId: str(a.institutionId),
        ticker: str(a.ticker),
        indexer: str(a.indexer),
        maturity: date(a.maturity),
        notes: str(a.notes),
        archived: a.archived === true || a.archived === 'TRUE' || a.archived === 'true',
        createdAt: date(a.createdAt) || U.today(),
      }));
    d.snapshots = (raw.snapshots || [])
      .filter((s) => s && s.id && date(s.date))
      .map((s) => ({ id: str(s.id), assetId: str(s.assetId), date: date(s.date), value: num(s.value) }));
    d.movements = (raw.movements || [])
      .filter((m) => m && m.id && date(m.date))
      .map((m) => ({
        id: str(m.id),
        assetId: str(m.assetId),
        date: date(m.date),
        kind: P.MOVEMENT_KINDS.some((k) => k.id === m.kind) ? m.kind : 'aporte',
        amount: Math.abs(num(m.amount)),
        note: str(m.note),
      }));
    // Categorias criadas pelo usuário antes dos lançamentos, que podem usá-las.
    const topIds = new Set(P.CASH_CATEGORIES.map((c) => c.id));
    const rawCats = (raw.customCategories || []).filter((c) => c && c.id && c.title);
    rawCats.filter((c) => !c.parentId).forEach((c) => topIds.add(str(c.id)));
    d.customCategories = rawCats.map((c) => {
      const parentId = c.parentId && topIds.has(str(c.parentId)) && str(c.parentId) !== str(c.id) ? str(c.parentId) : null;
      return { id: str(c.id), title: str(c.title).trim(), income: c.income === true || c.income === 'true', color: str(c.color) || '#8E8E93', parentId };
    });
    // Subcategoria herda o tipo (receita/despesa) da categoria principal.
    d.customCategories.forEach((c) => {
      if (!c.parentId) return;
      const parent = P.CASH_CATEGORIES.find((x) => x.id === c.parentId) || d.customCategories.find((x) => x.id === c.parentId);
      if (parent) c.income = parent.income;
    });
    P.setCustomCategories(d.customCategories);

    d.transactions = (raw.transactions || [])
      .filter((t) => t && t.id && date(t.date))
      .map((t) => {
        const cat = P.categoryById(t.category);
        const out = { id: str(t.id), date: date(t.date), amount: Math.abs(num(t.amount)), category: cat.id, income: cat.income, note: str(t.note) };
        if (t.ref) out.ref = str(t.ref);
        return out;
      });
    const s = raw.settings || {};
    d.settings = { goal: num(s.goal), hideValues: s.hideValues === true || s.hideValues === 'true', categoryRules: s.categoryRules && typeof s.categoryRules === 'object' ? s.categoryRules : {}, cardItemized: s.cardItemized === true || s.cardItemized === 'true' };
    const b = raw.benchmarks || {};
    d.benchmarks = { cdi: b.cdi || {}, ipca: b.ipca || {}, updated: b.updated || null };
    return d;
  };

  /**
   * Cria o repositório de dados. `backend` precisa ter:
   *   load(): Promise<objeto|null>
   *   save(objeto): Promise
   *   fetchSeries(codigo): Promise<[{data, valor}]>   (opcional)
   */
  P.createStore = function (backend) {
    let data = P.emptyData();
    const listeners = [];
    let status = 'idle';
    let pending = null;

    const store = {
      backend,
      get data() {
        return data;
      },
      get status() {
        return status;
      },
      onChange(fn) {
        listeners.push(fn);
      },
      async load() {
        const raw = await backend.load();
        data = P.normalizeData(raw);
        emit();
      },
      commit() {
        emit();
        scheduleSave();
      },
      replaceAll(newData) {
        data = P.normalizeData(newData);
        store.commit();
      },
      wipe() {
        const benchmarks = data.benchmarks;
        data = P.emptyData();
        data.benchmarks = benchmarks;
        P.setCustomCategories(data.customCategories);
        store.commit();
      },
      async flush() {
        if (pending) {
          clearTimeout(pending);
          pending = null;
          await doSave();
        }
      },

      // ---- Instituições ----
      institution(id) {
        return data.institutions.find((i) => i.id === id) || null;
      },
      saveInstitution(inst) {
        if (inst.id) {
          Object.assign(store.institution(inst.id) || {}, inst);
        } else {
          inst.id = U.uid();
          data.institutions.push(inst);
        }
        store.commit();
        return inst;
      },
      findOrCreateInstitution(name, autoCommit) {
        const label = String(name || '').trim() || 'Sem instituição';
        const key = U.norm(label);
        let inst = data.institutions.find((i) => U.norm(i.name) === key);
        if (inst) return { inst, created: false };
        const preset = P.INSTITUTION_PRESETS.find((p) => U.norm(p.name) === key);
        inst = { id: U.uid(), name: label, color: preset ? preset.color : P.PALETTE[data.institutions.length % P.PALETTE.length] };
        data.institutions.push(inst);
        if (autoCommit !== false) store.commit();
        return { inst, created: true };
      },
      deleteInstitution(id) {
        const assetIds = data.assets.filter((a) => a.institutionId === id).map((a) => a.id);
        assetIds.forEach((aid) => removeAsset(aid));
        data.institutions = data.institutions.filter((i) => i.id !== id);
        store.commit();
      },

      // ---- Ativos ----
      asset(id) {
        return data.assets.find((a) => a.id === id) || null;
      },
      saveAsset(asset, initialValue, initialDate, autoCommit) {
        if (asset.id && store.asset(asset.id)) {
          Object.assign(store.asset(asset.id), asset);
        } else {
          asset.id = U.uid();
          asset.createdAt = asset.createdAt || U.today();
          asset.archived = !!asset.archived;
          data.assets.push(asset);
          if (initialValue && initialValue > 0) {
            const d = initialDate || U.today();
            store.recordBalance(asset.id, d, initialValue, false);
            store.recordMovement(asset.id, 'aporte', initialValue, d, 'Posição inicial', false);
          }
        }
        if (autoCommit !== false) store.commit();
        return asset;
      },
      deleteAsset(id) {
        removeAsset(id);
        store.commit();
      },
      snapshotsOf(assetId) {
        return data.snapshots.filter((s) => s.assetId === assetId).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      },
      movementsOf(assetId) {
        return data.movements.filter((m) => m.assetId === assetId).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      },
      currentValue(assetId) {
        const s = store.snapshotsOf(assetId);
        return s.length ? s[s.length - 1].value : 0;
      },
      lastUpdate(assetId) {
        const s = store.snapshotsOf(assetId);
        return s.length ? s[s.length - 1].date : null;
      },
      invested(assetId) {
        return store.movementsOf(assetId).reduce((acc, m) => acc + m.amount * P.kindById(m.kind).investedSign, 0);
      },
      proventos(assetId) {
        return store.movementsOf(assetId).filter((m) => m.kind === 'provento').reduce((acc, m) => acc + m.amount, 0);
      },
      gain(assetId) {
        return store.currentValue(assetId) - store.invested(assetId) + store.proventos(assetId);
      },

      /** Registra o saldo do dia (substitui se já houver saldo na mesma data). */
      recordBalance(assetId, date, value, autoCommit) {
        const existing = data.snapshots.find((s) => s.assetId === assetId && s.date === date);
        if (existing) existing.value = value;
        else data.snapshots.push({ id: U.uid(), assetId, date, value });
        if (autoCommit !== false) store.commit();
      },
      recordMovement(assetId, kind, amount, date, note, autoCommit) {
        if (!(amount > 0)) return;
        data.movements.push({ id: U.uid(), assetId, date, kind, amount, note: note || '' });
        if (autoCommit !== false) store.commit();
      },
      deleteSnapshot(id) {
        data.snapshots = data.snapshots.filter((s) => s.id !== id);
        store.commit();
      },
      deleteMovement(id) {
        data.movements = data.movements.filter((m) => m.id !== id);
        store.commit();
      },

      // ---- Orçamento ----
      saveTransaction(t) {
        const cat = P.categoryById(t.category);
        t.income = cat.income;
        if (t.id) {
          Object.assign(data.transactions.find((x) => x.id === t.id) || {}, t);
        } else {
          t.id = U.uid();
          data.transactions.push(t);
        }
        store.commit();
      },
      deleteTransaction(id) {
        data.transactions = data.transactions.filter((t) => t.id !== id);
        store.commit();
      },

      // ---- Preferências ----
      setSetting(key, value) {
        data.settings[key] = value;
        store.commit();
      },
      // ---- Categorias personalizadas ----
      saveCategory(cat) {
        const title = String(cat.title || '').trim();
        if (!title) throw new Error('Informe o nome da categoria.');
        let parentId = cat.parentId || null;
        let income = !!cat.income;
        if (parentId) {
          const parent = P.categoryById(parentId);
          if (!P.categoryExists(parentId) || parent.parentId) throw new Error('Subcategorias só podem ficar dentro de uma categoria principal.');
          income = parent.income;
        }
        const clash = P.categoriesFor(income).find((c) => U.norm(c.title) === U.norm(title) && (c.parentId || null) === parentId && c.id !== cat.id);
        if (clash) throw new Error('Já existe uma categoria com esse nome.');
        const list = data.customCategories;
        let saved;
        if (cat.id && list.find((c) => c.id === cat.id)) {
          saved = list.find((c) => c.id === cat.id);
          if (P.subcategoriesOf(saved.id).length && parentId) throw new Error('Uma categoria com subcategorias não pode virar subcategoria.');
          Object.assign(saved, { title, income, color: cat.color || saved.color, parentId });
        } else {
          saved = { id: 'c_' + U.uid(), title, income, color: cat.color || (parentId ? P.categoryById(parentId).color : '#8E8E93'), parentId };
          list.push(saved);
        }
        P.setCustomCategories(list);
        store.commit();
        return saved;
      },
      /** Exclui a categoria (e suas subcategorias) movendo os lançamentos para `moveTo`. */
      deleteCategory(id, moveTo) {
        const ids = new Set([id].concat(P.subcategoriesOf(id).map((c) => c.id)));
        const target = moveTo && !ids.has(moveTo) ? moveTo : P.categoryById(id).income ? 'outrasReceitas' : 'outrosGastos';
        let moved = 0;
        data.transactions.forEach((t) => {
          if (ids.has(t.category)) {
            t.category = target;
            t.income = P.categoryById(target).income;
            moved++;
          }
        });
        data.customCategories = data.customCategories.filter((c) => !ids.has(c.id));
        const rules = data.settings.categoryRules || {};
        Object.keys(rules).forEach((k) => ids.has(rules[k]) && (rules[k] = target));
        P.setCustomCategories(data.customCategories);
        store.commit();
        return moved;
      },
      categoryUsage(id) {
        return data.transactions.filter((t) => P.inCategory(t.category, id)).length;
      },

      setBenchmarks(cdi, ipca) {
        data.benchmarks = { cdi, ipca, updated: new Date().toISOString() };
        store.commit();
      },
    };

    function removeAsset(id) {
      data.assets = data.assets.filter((a) => a.id !== id);
      data.snapshots = data.snapshots.filter((s) => s.assetId !== id);
      data.movements = data.movements.filter((m) => m.assetId !== id);
    }

    function emit() {
      listeners.forEach((fn) => {
        try {
          fn(data, status);
        } catch (e) {
          console.error(e);
        }
      });
    }

    function setStatus(s) {
      status = s;
      listeners.forEach((fn) => {
        try {
          fn(data, status, true);
        } catch (e) {
          console.error(e);
        }
      });
    }

    function scheduleSave() {
      setStatus('pending');
      clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        doSave();
      }, 700);
    }

    async function doSave() {
      setStatus('saving');
      try {
        await backend.save(data);
        setStatus('saved');
      } catch (e) {
        console.error(e);
        setStatus('error');
      }
    }

    return store;
  };
})(typeof window !== 'undefined' ? window : globalThis);

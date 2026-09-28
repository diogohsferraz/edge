// Testes do núcleo compartilhado: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCore() {
  const ctx = { console, Intl, setTimeout, clearTimeout, Date, Math, Number, String, Object, Array, Set, JSON, RegExp };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['util.js', 'model.js', 'analytics.js', 'csv.js', 'statement.js', 'invoice.js', 'sample.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'js', f), 'utf8'), ctx, { filename: f });
  }
  return ctx.Patrimonio;
}

const P = loadCore();
const U = P.util;
const memoryBackend = () => ({ saved: null, load: async () => null, save: async function (d) { this.saved = JSON.parse(JSON.stringify(d)); } });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('parseNumber entende formatos brasileiros', () => {
  assert.equal(U.parseNumber('1.234,56'), 1234.56);
  assert.equal(U.parseNumber('R$ 10.000,00'), 10000);
  assert.equal(U.parseNumber('1234,5'), 1234.5);
  assert.equal(U.parseNumber('1,234.56'), 1234.56);
  assert.equal(U.parseNumber('1.000'), 1000);
  assert.equal(U.parseNumber('12.5'), 12.5);
  assert.equal(U.parseNumber('-500'), -500);
  assert.equal(U.parseNumber(''), null);
  assert.equal(U.parseNumber('abc'), null);
});

test('datas e meses', () => {
  assert.equal(U.addMonths('2026-01', -1), '2025-12');
  assert.equal(U.addMonths('2026-11', 3), '2027-02');
  assert.equal(U.monthEnd('2024-02'), '2024-02-29');
  assert.deepEqual([...U.monthRange('2025-11', '2026-02')], ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('matchClass reconhece classes', () => {
  assert.equal(P.matchClass('CDB Banco Inter'), 'rendaFixa');
  assert.equal(P.matchClass('Tesouro IPCA+ 2035'), 'tesouro');
  assert.equal(P.matchClass('FII'), 'fiis');
  assert.equal(P.matchClass('Ações'), 'acoes');
  assert.equal(P.matchClass('Poupança'), 'conta');
  assert.equal(P.matchClass('Bitcoin'), 'cripto');
});

function portfolio(snaps, flows) {
  const d = P.emptyData();
  d.institutions.push({ id: 'i', name: 'Banco', color: '#000' });
  d.assets.push({ id: 'a', name: 'Ativo', classId: 'rendaFixa', institutionId: 'i' });
  snaps.forEach(([date, value], k) => d.snapshots.push({ id: 's' + k, assetId: 'a', date, value }));
  flows.forEach(([date, kind, amount], k) => d.movements.push({ id: 'm' + k, assetId: 'a', date, kind, amount }));
  return d;
}

test('saldo é carregado adiante e rentabilidade mensal sem fluxos', () => {
  const an = new P.Analytics(portfolio([['2026-01-31', 1000], ['2026-02-28', 1010]], [['2026-01-01', 'aporte', 1000]]), '2026-03-05');
  assert.equal(an.valueOf(an.assets[0], '2026-01-15'), 0);
  assert.equal(an.total('2026-02-10'), 1000);
  const feb = an.performanceFor('2026-02');
  near(feb.gain, 10);
  near(feb.rate, 0.01);
});

test('aporte não conta como ganho', () => {
  const an = new P.Analytics(portfolio([['2026-01-31', 1000], ['2026-02-28', 1510]], [['2026-01-01', 'aporte', 1000], ['2026-02-27', 'aporte', 500]]), '2026-03-05');
  const feb = an.performanceFor('2026-02');
  near(feb.gain, 10);
  near(feb.rate, 0.01, 0.001);
});

test('primeiro mês usa o aporte inicial como base', () => {
  const an = new P.Analytics(portfolio([['2026-01-01', 1000], ['2026-01-31', 1010]], [['2026-01-01', 'aporte', 1000]]), '2026-02-05');
  near(an.performanceFor('2026-01').rate, 0.01, 0.001);
});

test('provento conta como ganho', () => {
  const an = new P.Analytics(portfolio([['2026-01-31', 1000], ['2026-02-28', 1000]], [['2026-01-01', 'aporte', 1000], ['2026-02-15', 'provento', 8]]), '2026-03-05');
  near(an.performanceFor('2026-02').gain, 8);
  assert.equal(an.invested('2026-03-01'), 1000);
});

test('evolução, alocação e acumulado', () => {
  const an = new P.Analytics(portfolio([['2026-01-31', 3000]], [['2026-01-02', 'aporte', 3000]]), '2026-03-15');
  const ev = an.evolution();
  assert.equal(ev.length, 3);
  assert.equal(ev[2].total, 3000);
  assert.equal(an.allocationByClass()[0].share, 1);
  const cum = P.Analytics.cumulative([{ month: 'a', rate: 0.01 }, { month: 'b', rate: null }, { month: 'c', rate: 0.01 }]);
  near(cum[cum.length - 1].value, 0.0201);
  assert.equal(P.Analytics.monthsToReach(1000, 0, 100, 0), 10);
  assert.equal(P.Analytics.monthsToReach(1000, 0, 0, 0), null);
});

test('importa CSV em linhas', () => {
  const store = P.createStore(memoryBackend());
  const s = P.csv.importInto(store, P.csv.TEMPLATE_ROWS);
  assert.equal(s.assetsCreated, 2);
  assert.equal(s.institutionsCreated, 2);
  assert.equal(s.balances, 4);
  const reserva = store.data.assets.find((a) => a.name === 'Caixinha Reserva');
  assert.equal(store.currentValue(reserva.id), 10500);
  assert.equal(store.invested(reserva.id), 10400);
  assert.equal(reserva.classId, 'conta');
});

test('importa CSV com colunas por mês, sem duplicar ao reimportar', () => {
  const store = P.createStore(memoryBackend());
  const s = P.csv.importInto(store, P.csv.TEMPLATE_MONTHS);
  assert.equal(s.balances, 9);
  const cdb = store.data.assets.find((a) => a.name.startsWith('CDB'));
  assert.equal(store.currentValue(cdb.id), 25530);
  assert.equal(store.invested(cdb.id), 25000);
  assert.equal(store.lastUpdate(cdb.id), '2026-03-31');
  P.csv.importInto(store, P.csv.TEMPLATE_MONTHS);
  assert.equal(store.data.snapshots.length, 9);
  assert.equal(store.data.assets.length, 3);
});

test('cabeçalhos de mês em vários formatos', () => {
  assert.equal(P.csv.parseMonthHeader('01/2026'), '2026-01-31');
  assert.equal(P.csv.parseMonthHeader('jan/26'), '2026-01-31');
  assert.equal(P.csv.parseMonthHeader('Fev 2026'), '2026-02-28');
  assert.equal(P.csv.parseMonthHeader('Março de 2026'), '2026-03-31');
  assert.equal(P.csv.parseMonthHeader('2026-04'), '2026-04-30');
  assert.equal(P.csv.parseMonthHeader('observação'), null);
});

test('exportar e reimportar preserva os valores', () => {
  const a = P.createStore(memoryBackend());
  P.csv.importInto(a, P.csv.TEMPLATE_ROWS);
  const b = P.createStore(memoryBackend());
  const s = P.csv.importInto(b, P.csv.exportPortfolio(a));
  assert.equal(s.balances, 4);
  const total = b.data.assets.reduce((acc, x) => acc + b.currentValue(x.id), 0);
  near(total, 10500 + 25260);
});

test('dados de exemplo e normalização', () => {
  const store = P.createStore(memoryBackend());
  P.loadSampleData(store);
  assert.equal(store.data.assets.length, 10);
  const an = new P.Analytics(store.data);
  assert.ok(an.total() > 100000);
  assert.ok(an.evolution().length >= 18);
  const round = P.normalizeData(JSON.parse(JSON.stringify(store.data)));
  assert.equal(round.snapshots.length, store.data.snapshots.length);
  assert.equal(round.transactions.length, store.data.transactions.length);
});

test('excluir instituição apaga investimentos e históricos', () => {
  const store = P.createStore(memoryBackend());
  P.csv.importInto(store, P.csv.TEMPLATE_ROWS);
  const nubank = store.data.institutions.find((i) => i.name === 'Nubank');
  store.deleteInstitution(nubank.id);
  assert.equal(store.data.assets.length, 1);
  assert.ok(store.data.snapshots.every((s) => store.asset(s.assetId)));
});

test('importa extrato do Banco do Brasil (Latin-1) sem saldos e sem movimentações de investimento', () => {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'extrato-bb-exemplo.csv'));
  const text = new TextDecoder('windows-1252').decode(buf);
  const header = P.csv.parse(text)[0];
  assert.ok(P.statement.isStatement(header));
  const { rows, skipped } = P.statement.parse(text);
  assert.equal(skipped.balance, 3);
  assert.equal(skipped.investment, 4);
  const inc = rows.filter((r) => r.include);
  assert.equal(inc.length, 8);
  const cat = (t) => inc.find((r) => r.title === t).category;
  assert.equal(cat('Recebimento de Proventos'), 'salario');
  assert.equal(cat('Compra com Cartão'), 'transporte');
  assert.equal(cat('Pagamento de Boleto'), 'moradia');
  assert.equal(cat('Pagto cartão crédito'), 'cartao');
  assert.equal(cat('Pagamento de Impostos'), 'impostos');
  assert.equal(cat('Pix - Recebido'), 'outrasReceitas');
  assert.equal(inc.find((r) => r.details.startsWith('SMARTFIT')).category, 'saude');
  assert.equal(inc.find((r) => r.title === 'Pix - Enviado' && r.amount === 32).category, 'outrosGastos');

  const store = P.createStore(memoryBackend());
  assert.equal(P.statement.importRows(store, rows).added, 8);
  const total = (income) => store.data.transactions.filter((t) => t.income === income).reduce((a, t) => a + t.amount, 0);
  near(total(true), 8750);
  near(total(false), 32 + 150 + 650 + 195.72 + 1234.56 + 99.9);
  // Importar o mesmo extrato de novo não duplica.
  const again = P.statement.importRows(store, P.statement.parse(text).rows);
  assert.equal(again.added, 0);
  assert.equal(again.duplicates, 8);
  assert.ok(store.data.transactions.every((t) => t.ref));
  assert.ok(P.normalizeData(JSON.parse(JSON.stringify(store.data))).transactions.every((t) => t.ref));
});

test('lembra a categoria escolhida para o favorecido na próxima importação', () => {
  const text = new TextDecoder('windows-1252').decode(fs.readFileSync(path.join(__dirname, 'fixtures', 'extrato-bb-exemplo.csv')));
  const store = P.createStore(memoryBackend());
  const first = P.statement.parse(text).rows;
  first.find((r) => r.details === 'Fulano de Tal').category = 'moradia';
  P.statement.importRows(store, first);
  const second = P.statement.applyRules(P.statement.parse(text).rows, store.data.settings.categoryRules);
  const row = second.find((r) => r.details === 'Fulano de Tal');
  assert.equal(row.category, 'moradia');
  assert.equal(row.remembered, true);
  assert.equal(second.find((r) => r.details === 'POSTO EXEMPLO').remembered, undefined);
});

test('lê a fatura do cartão (Ourocard BB) e distribui nas categorias', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'fatura-bb-exemplo.txt'), 'utf8');
  const { info, rows } = P.invoice.parseText(text);
  assert.equal(info.card, '1234');
  assert.equal(info.closing, '2026-09-23');
  assert.equal(info.due, '2026-10-05');
  near(info.total, 1371);
  near(info.previous, 1500);

  const included = rows.filter((r) => r.include);
  const net = included.reduce((a, r) => a + (r.income ? -r.amount : r.amount), 0);
  near(net, 1371); // confere com o total da fatura

  const by = (title) => rows.find((r) => r.title.startsWith(title));
  assert.equal(by('PADARIA').category, 'alimentacao'); // seção "Restaurantes" do banco
  assert.equal(by('ASSAI').category, 'mercado'); // seção "Serviços": pela descrição
  assert.equal(by('EBN*SPOTIFY').category, 'assinaturas');
  assert.equal(by('POSTO').category, 'transporte');
  assert.equal(by('LOJA DESCONHECIDA').category, 'outrosGastos');
  assert.equal(by('UNICOMPRA').category, 'mercado');

  // Pagamento da fatura anterior não é despesa.
  const pay = rows.find((r) => r.kind === 'payment');
  assert.equal(pay.amount, 1500);
  assert.equal(pay.include, false);

  // Anuidade estornada: cobrança e crédito se anulam.
  assert.equal(by('ANUIDADE').include, false);
  assert.equal(by('DESC AUTOMATICO').include, false);

  // Parcelas: a 17ª entra no mês da fatura; a 1ª, na data da compra.
  const claro = by('CLARO');
  assert.deepEqual({ ...claro.installment }, { n: 17, total: 21 });
  assert.equal(claro.date, '2026-09-23');
  assert.equal(claro.purchaseDate, '2025-04-22'); // 17ª parcela em set/2026: compra em 2025
  assert.equal(claro.category, 'contas');
  assert.equal(by('HOTEL').purchaseDate, '2025-11-28');
  assert.equal(by('LEROY').date, '2026-09-15');
  assert.equal(by('LEROY').category, 'moradia');

  // Compras iguais no mesmo dia continuam sendo duas.
  assert.equal(rows.filter((r) => r.title.startsWith('LANCHONETE')).length, 2);
  assert.equal(new Set(rows.map((r) => r.ref)).size, rows.length);
});

test('fatura: remove o pagamento lançado pelo extrato e não duplica ao reimportar', () => {
  const store = P.createStore(memoryBackend());
  // Extrato com "Pagto cartão crédito" de R$ 1.500,00 (a fatura anterior)
  store.data.transactions.push({ id: 'pg', date: '2026-09-08', amount: 1500, category: 'cartao', income: false, note: 'Pagto cartão crédito', ref: 'extrato:x' });
  store.data.transactions.push({ id: 'pg2', date: '2026-06-08', amount: 999, category: 'cartao', income: false, note: 'Pagto cartão crédito', ref: 'extrato:y' });
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'fatura-bb-exemplo.txt'), 'utf8');
  const parsed = P.invoice.parseText(text);
  const pays = P.invoice.findCardPayments(store, parsed);
  assert.equal(pays.length, 2);
  assert.equal(pays.find((p) => p.tx.id === 'pg').suggested, true);
  assert.equal(pays.find((p) => p.tx.id === 'pg2').suggested, false);

  const res = P.invoice.importRows(store, parsed.rows, ['pg']);
  assert.equal(res.removed, 1);
  assert.equal(res.added, parsed.rows.filter((r) => r.include).length);
  assert.ok(!store.data.transactions.some((t) => t.id === 'pg'));
  assert.equal(store.data.settings.cardItemized, true);
  // Nenhuma regra de categoria "aprendida" só por causa da seção da fatura.
  assert.equal(Object.keys(store.data.settings.categoryRules).length, 0);

  const again = P.invoice.importRows(store, P.invoice.parseText(text).rows, []);
  assert.equal(again.added, 0);
  assert.ok(P.normalizeData(JSON.parse(JSON.stringify(store.data))).settings.cardItemized);
});

test('categorias e subcategorias personalizadas', () => {
  const store = P.createStore(memoryBackend());
  const filhos = store.saveCategory({ title: 'Filhos', income: false, color: '#123456' });
  const escola = store.saveCategory({ title: 'Escola', parentId: filhos.id });
  const condominio = store.saveCategory({ title: 'Condomínio', parentId: 'moradia' });
  assert.equal(escola.income, false);
  assert.equal(condominio.color, P.categoryById('moradia').color); // herda a cor da categoria principal
  assert.equal(P.categoryLabel(condominio.id), 'Moradia › Condomínio');
  assert.equal(P.rootCategory(escola.id).id, filhos.id);
  assert.ok(P.inCategory(condominio.id, 'moradia'));
  assert.ok(!P.inCategory('moradia', condominio.id));
  assert.deepEqual([...P.subcategoriesOf('moradia')].map((c) => c.id), [condominio.id]);
  const list = P.categoriesFor(false).map((c) => c.id);
  assert.ok(list.indexOf(condominio.id) === list.indexOf('moradia') + 1); // subcategoria logo abaixo da mãe

  // Validações
  assert.throws(() => store.saveCategory({ title: 'Escola', parentId: filhos.id }), /Já existe/);
  assert.throws(() => store.saveCategory({ title: 'X', parentId: escola.id }), /categoria principal/);
  assert.throws(() => store.saveCategory({ title: ' ' }), /nome/);

  // Lançamentos na subcategoria
  store.saveTransaction({ date: '2026-09-10', amount: 800, category: condominio.id, note: 'Condomínio' });
  store.saveTransaction({ date: '2026-09-12', amount: 300, category: escola.id, note: 'Material' });
  assert.equal(store.data.transactions.find((t) => t.note === 'Material').income, false);
  assert.equal(store.categoryUsage('moradia'), 1);

  // Persistência (JSON) mantém categorias e vínculos
  const round = P.normalizeData(JSON.parse(JSON.stringify(store.data)));
  assert.equal(round.customCategories.length, 3);
  assert.equal(round.transactions.find((t) => t.note === 'Material').category, escola.id);

  // Excluir a principal leva as subcategorias e move os lançamentos
  const moved = store.deleteCategory(filhos.id, 'educacao');
  assert.equal(moved, 1);
  assert.equal(store.data.transactions.find((t) => t.note === 'Material').category, 'educacao');
  assert.ok(!P.categoryExists(escola.id));
  assert.equal(store.data.customCategories.length, 1);
});

test('categoria de compra parcelada vale para todas as parcelas', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'fatura-bb-exemplo.txt'), 'utf8');
  // Fatura seguinte: fechamento em outubro e a 18ª parcela da mesma compra.
  const next = text
    .replace('Fatura fechada em 23/09/2026', 'Fatura fechada em 23/10/2026')
    .replace('05/10/2026', '05/11/2026')
    .replace('CLARO EXEMPLO PARC 17/21', 'CLARO EXEMPLO PARC 18/21')
    .replace('LEROY MERLIN PARC 01/06', 'LEROY MERLIN PARC 02/06');
  const store = P.createStore(memoryBackend());

  const sep = P.invoice.parseText(text);
  const claroSep = sep.rows.find((r) => r.title.startsWith('CLARO'));
  const leroySep = sep.rows.find((r) => r.title.startsWith('LEROY'));
  assert.ok(claroSep.group && leroySep.group);
  assert.equal(sep.rows.find((r) => r.title.startsWith('PADARIA')).group, null); // compra à vista não tem grupo
  claroSep.category = 'assinaturas'; // usuário muda a categoria da parcela
  P.invoice.importRows(store, sep.rows, []);

  const oct = P.invoice.parseText(next);
  const claroOct = oct.rows.find((r) => r.title.startsWith('CLARO'));
  const leroyOct = oct.rows.find((r) => r.title.startsWith('LEROY'));
  assert.equal(claroOct.group, claroSep.group); // mesma compra reconhecida na fatura seguinte
  assert.equal(leroyOct.group, leroySep.group);
  assert.equal(leroyOct.purchaseDate, '2026-09-15');
  P.invoice.applyInstallmentRules(store, oct.rows);
  assert.equal(claroOct.category, 'assinaturas');
  assert.ok(claroOct.tags.includes('parcela lembrada'));

  // Recategorizar na fatura nova atualiza a parcela já lançada.
  claroOct.category = 'contas';
  const res = P.invoice.importRows(store, oct.rows, []);
  assert.equal(res.installmentsUpdated, 1);
  const claros = store.data.transactions.filter((t) => t.group === claroSep.group);
  assert.equal(claros.length, 2);
  assert.ok(claros.every((t) => t.category === 'contas'));

  // Editar uma parcela no Orçamento aplica às demais.
  const n = store.applyCategoryToGroup(claroSep.group, 'moradia');
  assert.equal(n, 2);
  assert.equal(store.data.settings.installmentRules[claroSep.group], 'moradia');
  const round = P.normalizeData(JSON.parse(JSON.stringify(store.data)));
  assert.equal(round.transactions.filter((t) => t.group === claroSep.group).length, 2);
  assert.equal(round.settings.installmentRules[claroSep.group], 'moradia');
});

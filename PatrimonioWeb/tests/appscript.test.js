// Testa o Code.gs (Apps Script) com a planilha simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadGas } = require('./gas-mock');

function loadCore() {
  const ctx = { console, Intl, setTimeout, clearTimeout, Date, Math, Number, String, Object, Array, Set, JSON };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['util.js', 'model.js', 'analytics.js', 'csv.js', 'statement.js', 'invoice.js', 'sample.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'js', f), 'utf8'), ctx);
  }
  return ctx.Patrimonio;
}

test('planilha vazia devolve null', () => {
  const { ctx } = loadGas();
  assert.equal(ctx.getData(), null);
});

test('salvar e ler de volta preserva todos os dados', () => {
  const P = loadCore();
  const store = P.createStore({ load: async () => null, save: async () => {} });
  P.loadSampleData(store);
  store.setSetting('goal', 500000);
  const original = JSON.parse(JSON.stringify(store.data));

  const { ctx, ss } = loadGas();
  ctx.saveData(JSON.stringify(original));
  const names = ss._sheets.map((s) => s.name);
  assert.deepEqual([...names].sort(), ['Config', 'Investimentos', 'Instituições', 'Movimentações', 'Orçamento', 'Saldos'].sort());

  // Datas são gravadas como datas reais (a planilha mostra dd/mm/aaaa).
  const saldos = ss.getSheetByName('Saldos');
  assert.ok(saldos._cells[1][2] instanceof Date);
  assert.equal(saldos.formats[3], 'dd/mm/yyyy');

  const back = P.normalizeData(JSON.parse(ctx.getData()));
  for (const k of ['institutions', 'assets', 'snapshots', 'movements', 'transactions']) {
    assert.equal(back[k].length, original[k].length, k);
  }
  const sortById = (a) => [...a].sort((x, y) => (x.id < y.id ? -1 : 1));
  assert.deepEqual(JSON.parse(JSON.stringify(sortById(back.snapshots))), sortById(original.snapshots));
  assert.deepEqual(JSON.parse(JSON.stringify(sortById(back.movements))), sortById(original.movements));
  assert.deepEqual(JSON.parse(JSON.stringify(sortById(back.transactions))), sortById(original.transactions));
  assert.equal(back.settings.goal, 500000);

  const a1 = new P.Analytics(original);
  const a2 = new P.Analytics(back);
  assert.equal(a2.total(), a1.total());
});

test('regravar substitui o conteúdo (sem sobras de linhas antigas)', () => {
  const { ctx } = loadGas();
  const d = { institutions: [{ id: 'i1', name: 'A', color: '#000' }, { id: 'i2', name: 'B', color: '#111' }], assets: [], snapshots: [], movements: [], transactions: [], settings: {}, benchmarks: {} };
  ctx.saveData(JSON.stringify(d));
  d.institutions.pop();
  ctx.saveData(JSON.stringify(d));
  assert.equal(JSON.parse(ctx.getData()).institutions.length, 1);
});

test('exporta para o Drive e busca séries do Banco Central', () => {
  const { ctx, files } = loadGas({ fetchText: '[{"data":"01/01/2026","valor":"1.16"}]' });
  assert.match(ctx.exportToDrive('patrimonio.csv', 'a;b'), /drive\.google\.com/);
  assert.equal(files[0].name, 'patrimonio.csv');
  assert.equal(JSON.parse(ctx.fetchSeries(4391))[0].valor, '1.16');
  assert.throws(() => ctx.fetchSeries(999));
});

test('regras de categoria e referência do extrato sobrevivem à planilha', () => {
  const { ctx } = loadGas();
  const d = { institutions: [], assets: [], snapshots: [], movements: [], transactions: [{ id: 't1', date: '2026-09-01', amount: 10, category: 'moradia', income: false, note: 'x', ref: 'extrato:abc' }], settings: { goal: 0, categoryRules: { 'fulano de tal': 'moradia' } }, benchmarks: {} };
  ctx.saveData(JSON.stringify(d));
  const back = JSON.parse(ctx.getData());
  assert.equal(back.transactions[0].ref, 'extrato:abc');
  assert.equal(back.settings.categoryRules['fulano de tal'], 'moradia');
});

test('categorias personalizadas sobrevivem à planilha', () => {
  const { ctx } = loadGas();
  const cats = [{ id: 'c_1', title: 'Condomínio', income: false, color: '#0A84FF', parentId: 'moradia' }];
  const d = { institutions: [], assets: [], snapshots: [], movements: [], customCategories: cats, transactions: [{ id: 't1', date: '2026-09-01', amount: 10, category: 'c_1', income: false, note: 'x' }], settings: {}, benchmarks: {} };
  ctx.saveData(JSON.stringify(d));
  const back = JSON.parse(ctx.getData());
  assert.equal(back.customCategories[0].parentId, 'moradia');
  assert.equal(back.transactions[0].category, 'c_1');
});

test('grupo de parcelas e regras de parcelas sobrevivem à planilha', () => {
  const { ctx } = loadGas();
  const d = { institutions: [], assets: [], snapshots: [], movements: [], transactions: [{ id: 't1', date: '2026-09-23', amount: 237.57, category: 'contas', income: false, note: 'Claro', group: 'parc:1234:2025-04-22:claro:21' }], settings: { installmentRules: { 'parc:1234:2025-04-22:claro:21': 'contas' } }, benchmarks: {} };
  ctx.saveData(JSON.stringify(d));
  const back = JSON.parse(ctx.getData());
  assert.equal(back.transactions[0].group, 'parc:1234:2025-04-22:claro:21');
  assert.equal(back.settings.installmentRules['parc:1234:2025-04-22:claro:21'], 'contas');
});

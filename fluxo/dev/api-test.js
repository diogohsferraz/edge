// Testes de ponta a ponta da API usando a simulação do Apps Script.
process.argv[2] = '0';
const assert = require('assert');
const { context: G, mails } = require('./server.js');
const ok = (r) => { if (!r.ok) throw new Error(r.error); return JSON.parse(JSON.stringify(r.data)); };

const s = ok(G.publicApi('register', { email: 'Admin@Edge.test', name: 'Ana Admin', password: 'segredo123' }));
const T = s.token;
assert.strictEqual(s.user.role, 'admin');
assert.strictEqual(G.publicApi('register', { email: 'x@y.z', name: 'X', password: 'segredo123' }).ok, false, 'cadastro fechado após o 1º');
assert.strictEqual(G.publicApi('login', { email: 'admin@edge.test', password: 'errada000' }).ok, false);
ok(G.publicApi('login', { email: 'admin@edge.test', password: 'segredo123' }));

ok(G.api(T, 'users.create', { email: 'bia@edge.test', name: 'Bia', password: 'senha12345', role: 'member' }));
const bia = ok(G.publicApi('login', { email: 'bia@edge.test', password: 'senha12345' })).token;
assert.match(G.api(bia, 'pipes.save', { pipe: { name: 'x' } }).error, /administradores/);

const seed = ok(G.api(T, 'demo.seed'));
const boot = ok(G.api(T, 'bootstrap'));
assert.strictEqual(boot.pipes.length, 2);
const b = ok(G.api(T, 'pipes.get', { id: seed.pipes[0] }));
assert.strictEqual(b.phases.length, 6);
assert.strictEqual(b.cards.length, 7);
const fieldBy = (label) => b.pipe.startFields.concat(...b.phases.map((p) => p.fields)).find((f) => f.label === label);

// Automação de etiqueta na criação
const vals = {};
vals[fieldBy('O que precisa ser comprado?').id] = 'Projetor';
vals[fieldBy('Justificativa').id] = 'Auditório';
vals[fieldBy('E-mail do solicitante').id] = 'bia@edge.test';
vals[fieldBy('Tipo').id] = 'Equipamento';
vals[fieldBy('Urgência').id] = 'Alta';
const card = ok(G.api(bia, 'cards.create', { pipeId: b.pipe.id, values: vals }));
assert.strictEqual(card.title, 'Projetor');
assert.deepStrictEqual(card.labels, [b.pipe.labels[0].id], 'etiqueta Urgente aplicada');

// Campos obrigatórios bloqueiam avanço
ok(G.api(T, 'cards.move', { id: card.id, phaseId: b.phases[1].id }));
assert.match(G.api(T, 'cards.move', { id: card.id, phaseId: b.phases[2].id }).error, /obrigatórios/);
const up = {};
up[fieldBy('Cotações').id] = [ok(G.api(T, 'files.upload', { name: 'cot.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF-1').toString('base64') }))];
up[fieldBy('Valor final').id] = 4200;
ok(G.api(T, 'cards.update', { id: card.id, patch: { values: up } }));
ok(G.api(T, 'cards.move', { id: card.id, phaseId: b.phases[2].id }));
const dl = ok(G.api(T, 'files.download', { id: up[fieldBy('Cotações').id][0].id }));
assert.strictEqual(Buffer.from(dl.data, 'base64').toString(), '%PDF-1');

// Aprovação "Não" → automação move para Recusado
const ap = {}; ap[fieldBy('Aprovado?').id] = 'Não';
const after = ok(G.api(T, 'cards.update', { id: card.id, patch: { values: ap } }));
assert.strictEqual(after.phaseId, b.phases[5].id, 'movido para Recusado');
const detail = ok(G.api(T, 'cards.get', { id: card.id }));
assert.ok(detail.comments.some((c) => /recusada/.test(c.text)));
assert.strictEqual(detail.card.history.length, 4);
assert.ok(detail.card.doneAt);

// Mover para Concluído dispara e-mail com campo preenchido
const c2 = ok(G.api(T, 'cards.create', { pipeId: b.pipe.id, values: vals }));
ok(G.api(T, 'automations.save', { automation: { pipeId: b.pipe.id, name: 'teste', trigger: { type: 'card_created' }, conditions: [{ fieldId: '__title', op: 'eq', value: 'nada' }], actions: [{ type: 'comment', text: 'x' }] } }));
const internal = { user: { id: 'automation', role: 'admin' }, system: true, depth: 0 };
G.Db.reset(); G.moveCard(internal, c2.id, b.phases[4].id);
assert.ok(mails.some((m) => m.to === 'bia@edge.test' && /Projetor/.test(m.subject)), 'e-mail enviado');

// Formulário público
const pub = ok(G.publicApi('form.get', { token: b.pipe.publicToken }));
assert.ok(pub.fields.length >= 5);
assert.strictEqual(G.publicApi('form.submit', { token: b.pipe.publicToken, values: {} }).ok, false);
ok(G.publicApi('form.submit', { token: b.pipe.publicToken, values: vals }));
assert.strictEqual(ok(G.api(T, 'pipes.get', { id: b.pipe.id })).cards.length, 10);

// SLA: card antigo dispara comentário uma única vez
const r1 = ok(G.api(T, 'automations.runScheduled'));
const r2 = ok(G.api(T, 'automations.runScheduled'));
assert.ok(r1.fired > 0, 'SLA disparou'); assert.strictEqual(r2.fired, 0, 'não repete');

// Database e conexão
const recs = ok(G.api(T, 'records.list', { tableId: seed.table }));
assert.strictEqual(recs.length, 3);
ok(G.api(bia, 'records.save', { record: { tableId: seed.table, values: { [ok(G.api(T, 'tables.list'))[0].fields[0].id]: 'Nova Ltda' } } }));
assert.strictEqual(ok(G.api(T, 'records.list', { tableId: seed.table })).length, 4);

// Texto que parece fórmula ou número fica como texto
const evil = {}; evil[fieldBy('O que precisa ser comprado?').id] = '=HYPERLINK("x")';
const c3 = ok(G.api(T, 'cards.update', { id: c2.id, patch: { values: evil } }));
assert.strictEqual(c3.values[fieldBy('O que precisa ser comprado?').id], '=HYPERLINK("x")');
ok(G.api(T, 'cards.update', { id: c2.id, patch: { dueDate: '2026-12-01' } }));
assert.strictEqual(ok(G.api(T, 'cards.get', { id: c2.id })).card.dueDate, '2026-12-01');

// Fases: reordenar, excluir com cards falha
assert.match(G.api(T, 'phases.delete', { id: b.phases[0].id }).error, /Mova ou exclua/);
ok(G.api(T, 'auth.logout'));
assert.strictEqual(G.api(T, 'bootstrap').error, 'SESSION_EXPIRED');
console.log('OK — todos os testes da API passaram');
process.exit(0);

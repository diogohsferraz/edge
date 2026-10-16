/** Pipes, fases, campos e formulário público. */

var FIELD_TYPES = ['text', 'textarea', 'number', 'currency', 'date', 'datetime', 'email', 'phone',
  'select', 'radio', 'checklist', 'checkbox', 'user', 'attachment', 'connection'];

function canSeePipe(user, pipe) {
  if (!pipe || isTrue(pipe.archived)) return false;
  if (user.role === 'admin') return true;
  var m = pipe.members || [];
  return m.length === 0 || m.indexOf(user.id) >= 0;
}

function visiblePipes(user) {
  return Db.all('pipes').filter(function (p) { return canSeePipe(user, p); });
}

function requirePipe(ctx, pipeId) {
  var pipe = Db.get('pipes', pipeId);
  if (!canSeePipe(ctx.user, pipe)) throw new Error('Pipe não encontrado ou sem acesso.');
  return pipe;
}

function normalizeFields(fields) {
  return (fields || []).map(function (f) {
    var type = FIELD_TYPES.indexOf(f.type) >= 0 ? f.type : 'text';
    var out = {
      id: f.id || newId('f'),
      label: String(f.label || 'Campo sem nome').trim(),
      type: type,
      required: !!f.required,
      help: String(f.help || '')
    };
    if (type === 'select' || type === 'radio' || type === 'checklist') {
      out.options = (f.options || []).map(function (o) { return String(o).trim(); }).filter(String);
    }
    if (type === 'connection') out.tableId = f.tableId || '';
    return out;
  });
}

function savePipe(ctx, p) {
  var data = {
    name: String(p.name || '').trim() || 'Novo pipe',
    description: String(p.description || ''),
    color: p.color || '#2a78d6',
    members: p.members || [],
    startFields: normalizeFields(p.startFields),
    labels: (p.labels || []).map(function (l) {
      return { id: l.id || newId('l'), name: String(l.name || '').trim(), color: l.color || '#888888' };
    }).filter(function (l) { return l.name; }),
    publicForm: !!p.publicForm
  };
  if (p.id) {
    var existing = Db.get('pipes', p.id);
    if (data.publicForm && !existing.publicToken) data.publicToken = newId('pf');
    return Db.update('pipes', p.id, data);
  }
  data.id = newId('p');
  data.publicToken = newId('pf');
  data.createdAt = nowIso();
  data.createdBy = ctx.user.id;
  data.archived = false;
  var pipe = Db.insert('pipes', data);
  ['Caixa de entrada', 'Em andamento', 'Concluído'].forEach(function (name, i) {
    Db.insert('phases', {
      id: newId('h'), pipeId: pipe.id, name: name, order: i, fields: [],
      slaHours: '', isDone: i === 2, description: ''
    });
  });
  return pipe;
}

function deletePipe(id) {
  Db.removeWhere('cards', function (c) { return c.pipeId === id; });
  Db.removeWhere('phases', function (h) { return h.pipeId === id; });
  Db.removeWhere('automations', function (a) { return a.pipeId === id; });
  Db.remove('pipes', id);
  return true;
}

function pipePhases(pipeId) {
  return Db.where('phases', function (h) { return h.pipeId === pipeId; })
    .sort(function (a, b) { return Number(a.order) - Number(b.order); });
}

function getPipeBundle(ctx, id) {
  var pipe = requirePipe(ctx, id);
  return {
    pipe: pipe,
    phases: pipePhases(id),
    cards: Db.where('cards', function (c) { return c.pipeId === id && !isTrue(c.archived); }),
    automations: Db.where('automations', function (a) { return a.pipeId === id; }).length
  };
}

function savePhase(ctx, ph) {
  var data = {
    name: String(ph.name || '').trim() || 'Nova fase',
    fields: normalizeFields(ph.fields),
    slaHours: ph.slaHours === '' || ph.slaHours === null || ph.slaHours === undefined ? '' : Number(ph.slaHours),
    isDone: !!ph.isDone,
    description: String(ph.description || '')
  };
  if (ph.id) return Db.update('phases', ph.id, data);
  var siblings = pipePhases(ph.pipeId);
  data.id = newId('h');
  data.pipeId = ph.pipeId;
  data.order = siblings.length ? Number(siblings[siblings.length - 1].order) + 1 : 0;
  return Db.insert('phases', data);
}

function deletePhase(id) {
  var phase = Db.get('phases', id);
  var used = Db.where('cards', function (c) { return c.phaseId === id && !isTrue(c.archived); });
  if (used.length) throw new Error('Mova ou exclua os ' + used.length + ' card(s) desta fase antes de excluí-la.');
  if (pipePhases(phase.pipeId).length <= 1) throw new Error('O pipe precisa de pelo menos uma fase.');
  Db.remove('phases', id);
  return true;
}

function reorderPhases(pipeId, ids) {
  ids.forEach(function (id, i) { Db.update('phases', id, { order: i }); });
  return pipePhases(pipeId);
}

/* ---------- Formulário público ---------- */

function pipeByPublicToken(token) {
  var pipe = Db.where('pipes', function (p) { return p.publicToken === token; })[0];
  if (!pipe || !isTrue(pipe.publicForm) || isTrue(pipe.archived)) throw new Error('Formulário não encontrado ou desativado.');
  return pipe;
}

function getPublicForm(token) {
  var pipe = pipeByPublicToken(token);
  var fields = pipe.startFields.filter(function (f) { return f.type !== 'user' && f.type !== 'connection'; });
  return { name: pipe.name, description: pipe.description, color: pipe.color, fields: fields };
}

function submitPublicForm(token, values) {
  var pipe = pipeByPublicToken(token);
  var ctx = { user: { id: 'public', name: 'Formulário público', role: 'member' }, depth: 0, public: true };
  var allowed = {};
  pipe.startFields.forEach(function (f) {
    if (f.type !== 'user' && f.type !== 'connection' && values && values[f.id] !== undefined) allowed[f.id] = values[f.id];
  });
  var card = createCard(ctx, pipe.id, allowed, {});
  return { id: card.id };
}

function uploadPublicFile(token, name, mimeType, data) {
  pipeByPublicToken(token);
  return uploadFile(name, mimeType, data);
}

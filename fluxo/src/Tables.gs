/** Databases: tabelas de registros que podem ser conectadas aos cards. */

function saveTable(t) {
  var fields = normalizeFields(t.fields).filter(function (f) { return f.type !== 'connection'; });
  var data = {
    name: String(t.name || '').trim() || 'Nova database',
    description: String(t.description || ''),
    fields: fields,
    titleFieldId: t.titleFieldId && fields.some(function (f) { return f.id === t.titleFieldId; })
      ? t.titleFieldId : (fields[0] ? fields[0].id : '')
  };
  if (t.id) return Db.update('tables', t.id, data);
  data.id = newId('t');
  data.createdAt = nowIso();
  return Db.insert('tables', data);
}

function deleteTable(id) {
  Db.removeWhere('records', function (r) { return r.tableId === id; });
  Db.remove('tables', id);
  return true;
}

function listRecords(tableId) {
  return Db.where('records', function (r) { return r.tableId === tableId; });
}

function recordTitle(r) {
  var t = Db.get('tables', r.tableId);
  var v = t && t.titleFieldId ? (r.values || {})[t.titleFieldId] : '';
  return v ? String(v) : 'Registro ' + r.id.slice(-4);
}

function saveRecord(ctx, rec) {
  var table = Db.get('tables', rec.tableId);
  if (!table) throw new Error('Database não encontrada.');
  var missing = missingRequired(table.fields, rec.values || {});
  if (missing.length) throw new Error('Preencha os campos obrigatórios: ' + missing.join(', '));
  if (rec.id) return Db.update('records', rec.id, { values: rec.values || {}, updatedAt: nowIso() });
  return Db.insert('records', {
    id: newId('d'), tableId: rec.tableId, values: rec.values || {},
    createdAt: nowIso(), createdBy: ctx.user.id, updatedAt: nowIso()
  });
}

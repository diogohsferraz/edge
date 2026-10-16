/** Cards: criação, edição, movimentação entre fases, comentários, anexos e histórico. */

function isEmptyValue(v) {
  return v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

function missingRequired(fields, values) {
  return (fields || []).filter(function (f) { return f.required && isEmptyValue(values[f.id]); })
    .map(function (f) { return f.label; });
}

function cardTitle(pipe, values) {
  var first = (pipe.startFields || []).filter(function (f) {
    return ['text', 'email', 'select', 'radio'].indexOf(f.type) >= 0 && !isEmptyValue(values[f.id]);
  })[0];
  return first ? String(values[first.id]).slice(0, 140) : 'Card sem título';
}

function logActivity(ctx, card, type, data) {
  Db.insert('activity', {
    id: newId('a'), pipeId: card.pipeId, cardId: card.id, userId: ctx.user.id,
    type: type, data: data || {}, createdAt: nowIso()
  });
}

function createCard(ctx, pipeId, values, extra) {
  var pipe = ctx.public || ctx.system ? Db.get('pipes', pipeId) : requirePipe(ctx, pipeId);
  if (!pipe) throw new Error('Pipe não encontrado.');
  values = values || {};
  extra = extra || {};
  var missing = missingRequired(pipe.startFields, values);
  if (missing.length && !ctx.system) throw new Error('Preencha os campos obrigatórios: ' + missing.join(', '));
  var phases = pipePhases(pipeId);
  var phase = (extra.phaseId && phases.filter(function (h) { return h.id === extra.phaseId; })[0]) || phases[0];
  var now = nowIso();
  var card = Db.insert('cards', {
    id: newId('c'), pipeId: pipeId, phaseId: phase.id,
    title: String(extra.title || cardTitle(pipe, values)),
    values: values,
    assignees: extra.assignees || [],
    labels: extra.labels || [],
    dueDate: extra.dueDate || '',
    phaseEnteredAt: now,
    history: [{ phaseId: phase.id, enteredAt: now, leftAt: null }],
    flags: {},
    createdAt: now, createdBy: ctx.user.id, updatedAt: now,
    doneAt: isTrue(phase.isDone) ? now : '',
    archived: false
  });
  logActivity(ctx, card, 'created', { phaseId: phase.id });
  runAutomations(ctx, 'card_created', card, {});
  return Db.get('cards', card.id);
}

function requireCard(ctx, id) {
  var card = Db.get('cards', id);
  if (!card || isTrue(card.archived)) throw new Error('Card não encontrado.');
  if (!ctx.system) requirePipe(ctx, card.pipeId);
  return card;
}

function getCardDetail(ctx, id) {
  var card = requireCard(ctx, id);
  var comments = Db.where('comments', function (c) { return c.cardId === id; });
  var activity = Db.where('activity', function (a) { return a.cardId === id; });
  var connected = {};
  var pipe = Db.get('pipes', card.pipeId);
  var allFields = pipe.startFields || [];
  pipePhases(card.pipeId).forEach(function (h) { allFields = allFields.concat(h.fields || []); });
  allFields.forEach(function (f) {
    if (f.type === 'connection' && card.values[f.id]) {
      var ids = [].concat(card.values[f.id]);
      ids.forEach(function (rid) { var r = Db.get('records', rid); if (r) connected[rid] = r; });
    }
  });
  return { card: card, comments: comments, activity: activity, records: connected };
}

function updateCard(ctx, id, patch) {
  var card = requireCard(ctx, id);
  var changes = {};
  var changedFields = [];
  if (patch.values) {
    var values = card.values || {};
    Object.keys(patch.values).forEach(function (k) {
      if (JSON.stringify(values[k]) !== JSON.stringify(patch.values[k])) {
        changedFields.push(k);
        values[k] = patch.values[k];
      }
    });
    changes.values = values;
  }
  ['title', 'assignees', 'labels', 'dueDate'].forEach(function (k) {
    if (patch[k] !== undefined) changes[k] = patch[k];
  });
  changes.updatedAt = nowIso();
  var updated = Db.update('cards', id, changes);
  if (changedFields.length) logActivity(ctx, updated, 'fields_updated', { fields: changedFields });
  if (patch.assignees !== undefined) logActivity(ctx, updated, 'assignees', { assignees: patch.assignees });
  changedFields.forEach(function (fid) { runAutomations(ctx, 'field_updated', updated, { fieldId: fid }); });
  return Db.get('cards', id);
}

function moveCard(ctx, id, phaseId) {
  var card = requireCard(ctx, id);
  if (card.phaseId === phaseId) return card;
  var phases = pipePhases(card.pipeId);
  var from = phases.filter(function (h) { return h.id === card.phaseId; })[0];
  var to = phases.filter(function (h) { return h.id === phaseId; })[0];
  if (!to) throw new Error('Fase de destino inválida.');
  // Como no Pipefy, os campos obrigatórios da fase atual precisam estar
  // preenchidos para avançar; voltar para uma fase anterior é sempre permitido.
  if (from && Number(to.order) > Number(from.order) && !ctx.system) {
    var missing = missingRequired(from.fields, card.values || {});
    if (missing.length) throw new Error('Preencha os campos obrigatórios da fase "' + from.name + '": ' + missing.join(', '));
  }
  var now = nowIso();
  var history = card.history || [];
  if (history.length && !history[history.length - 1].leftAt) history[history.length - 1].leftAt = now;
  history.push({ phaseId: phaseId, enteredAt: now, leftAt: null });
  var flags = card.flags || {};
  delete flags.slaNotified;
  var updated = Db.update('cards', id, {
    phaseId: phaseId, phaseEnteredAt: now, history: history, flags: flags, updatedAt: now,
    doneAt: isTrue(to.isDone) ? now : ''
  });
  logActivity(ctx, updated, 'moved', { from: card.phaseId, to: phaseId });
  runAutomations(ctx, 'card_moved', updated, { phaseId: phaseId, fromPhaseId: card.phaseId });
  return Db.get('cards', id);
}

function deleteCard(ctx, id) {
  var card = requireCard(ctx, id);
  if (ctx.user.role !== 'admin' && card.createdBy !== ctx.user.id) {
    throw new Error('Só administradores ou quem criou o card podem excluí-lo.');
  }
  Db.update('cards', id, { archived: true, updatedAt: nowIso() });
  logActivity(ctx, card, 'deleted', {});
  return true;
}

function addComment(ctx, id, text) {
  var card = requireCard(ctx, id);
  text = String(text || '').trim();
  if (!text) throw new Error('Escreva um comentário.');
  return Db.insert('comments', { id: newId('m'), cardId: card.id, userId: ctx.user.id, text: text, createdAt: nowIso() });
}

/** Estado de prazo do card: SLA da fase atual e data de vencimento. */
function cardLateness(card, phases) {
  var phase = phases.filter(function (h) { return h.id === card.phaseId; })[0];
  var out = { late: false, expiring: false, overdue: false };
  if (!phase || isTrue(phase.isDone)) return out;
  var sla = Number(phase.slaHours);
  if (sla > 0 && card.phaseEnteredAt) {
    var hours = (Date.now() - new Date(card.phaseEnteredAt).getTime()) / 3600000;
    out.late = hours > sla;
    out.expiring = !out.late && hours > sla * 0.75;
  }
  if (card.dueDate && new Date(card.dueDate).getTime() < Date.now()) {
    out.overdue = true;
    out.late = true;
  }
  return out;
}

/* ---------- Anexos (Google Drive) ---------- */

var MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function attachmentsFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FILES_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recria abaixo */ }
  }
  var folder = DriveApp.createFolder('Fluxo — Anexos');
  props.setProperty('FILES_FOLDER_ID', folder.getId());
  return folder;
}

function uploadFile(name, mimeType, base64) {
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('Arquivo maior que 10 MB.');
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', String(name || 'arquivo'));
  var file = attachmentsFolder().createFile(blob);
  return { id: file.getId(), name: file.getName(), size: bytes.length, mimeType: blob.getContentType() };
}

function downloadFile(id) {
  var file = DriveApp.getFileById(id);
  var parents = file.getParents();
  var folderId = attachmentsFolder().getId();
  var inFolder = false;
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder) throw new Error('Arquivo não pertence ao Fluxo.');
  var blob = file.getBlob();
  return { name: file.getName(), mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

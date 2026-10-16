/**
 * Automações no formato "quando <evento> e <condições>, faça <ações>".
 * Eventos: card_created, card_moved, field_updated, sla_late, due_overdue.
 */

var MAX_AUTOMATION_DEPTH = 3;

function listAutomations(pipeId) {
  return Db.where('automations', function (a) { return a.pipeId === pipeId; });
}

function saveAutomation(a) {
  var data = {
    pipeId: a.pipeId,
    name: String(a.name || '').trim() || 'Automação',
    active: a.active !== false,
    trigger: a.trigger || { type: 'card_created' },
    conditions: a.conditions || [],
    actions: a.actions || []
  };
  if (!data.actions.length) throw new Error('Adicione pelo menos uma ação.');
  if (a.id) return Db.update('automations', a.id, data);
  data.id = newId('r');
  data.runs = 0;
  data.lastRunAt = '';
  data.createdAt = nowIso();
  return Db.insert('automations', data);
}

function systemCtx(parent) {
  return {
    user: { id: 'automation', name: 'Automação', role: 'admin', email: '' },
    system: true,
    depth: ((parent && parent.depth) || 0) + 1
  };
}

function triggerMatches(trigger, event, info) {
  if (!trigger || trigger.type !== event) return false;
  if ((event === 'card_moved' || event === 'sla_late') && trigger.phaseId) return trigger.phaseId === info.phaseId;
  if (event === 'field_updated' && trigger.fieldId) return trigger.fieldId === info.fieldId;
  return true;
}

function conditionHolds(cond, card) {
  var v = cond.fieldId === '__title' ? card.title : (card.values || {})[cond.fieldId];
  var text = Array.isArray(v) ? v.join(', ') : (v === undefined || v === null ? '' : String(v));
  var target = String(cond.value === undefined ? '' : cond.value);
  switch (cond.op) {
    case 'eq': return text.toLowerCase() === target.toLowerCase();
    case 'neq': return text.toLowerCase() !== target.toLowerCase();
    case 'contains': return text.toLowerCase().indexOf(target.toLowerCase()) >= 0;
    case 'empty': return isEmptyValue(v);
    case 'not_empty': return !isEmptyValue(v);
    case 'gt': return Number(v) > Number(target);
    case 'lt': return Number(v) < Number(target);
    default: return true;
  }
}

function runAutomations(ctx, event, card, info) {
  if ((ctx.depth || 0) >= MAX_AUTOMATION_DEPTH) return;
  var rules = Db.where('automations', function (a) {
    return a.pipeId === card.pipeId && isTrue(a.active) && triggerMatches(a.trigger, event, info);
  });
  rules.forEach(function (rule) {
    var current = Db.get('cards', card.id);
    if (!current || isTrue(current.archived)) return;
    var ok = (rule.conditions || []).every(function (c) { return conditionHolds(c, current); });
    if (!ok) return;
    var sctx = systemCtx(ctx);
    (rule.actions || []).forEach(function (action) {
      try {
        runAction(sctx, rule, action, Db.get('cards', card.id));
      } catch (err) {
        logActivity(sctx, current, 'automation_error', { automation: rule.name, error: String(err.message || err) });
      }
    });
    Db.update('automations', rule.id, { runs: Number(rule.runs || 0) + 1, lastRunAt: nowIso() });
    logActivity(sctx, current, 'automation', { automation: rule.name });
  });
}

function allPipeFields(pipeId) {
  var pipe = Db.get('pipes', pipeId);
  var fields = (pipe.startFields || []).slice();
  pipePhases(pipeId).forEach(function (h) { fields = fields.concat(h.fields || []); });
  return fields;
}

function formatValue(field, v) {
  if (isEmptyValue(v)) return '';
  if (field && field.type === 'user') {
    return [].concat(v).map(function (id) { var u = Db.get('users', id); return u ? u.name : id; }).join(', ');
  }
  if (field && field.type === 'attachment') return [].concat(v).map(function (f) { return f.name; }).join(', ');
  if (field && field.type === 'connection') {
    return [].concat(v).map(function (id) { var r = Db.get('records', id); return r ? recordTitle(r) : id; }).join(', ');
  }
  if (field && field.type === 'checkbox') return isTrue(v) ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function fillTemplate(text, card) {
  var pipe = Db.get('pipes', card.pipeId);
  var phase = Db.get('phases', card.phaseId);
  var fields = allPipeFields(card.pipeId);
  var url = ScriptApp.getService().getUrl();
  return String(text || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (m, key) {
    var k = key.toLowerCase();
    if (k === 'titulo' || k === 'título') return card.title;
    if (k === 'fase') return phase ? phase.name : '';
    if (k === 'pipe') return pipe ? pipe.name : '';
    if (k === 'link') return url ? url + '#/card/' + card.id : '';
    if (k === 'vencimento') return card.dueDate ? new Date(card.dueDate).toLocaleDateString('pt-BR') : '';
    if (k === 'responsaveis' || k === 'responsáveis') {
      return (card.assignees || []).map(function (id) { var u = Db.get('users', id); return u ? u.email : ''; })
        .filter(String).join(', ');
    }
    if (k === 'criador') { var c = Db.get('users', card.createdBy); return c ? c.email : ''; }
    if (k.indexOf('campo:') === 0) {
      var label = key.slice(key.indexOf(':') + 1).trim().toLowerCase();
      var f = fields.filter(function (x) { return x.label.toLowerCase() === label; })[0];
      return f ? formatValue(f, (card.values || {})[f.id]) : '';
    }
    return m;
  });
}

function runAction(ctx, rule, action, card) {
  switch (action.type) {
    case 'move_card':
      if (action.phaseId && action.phaseId !== card.phaseId) moveCard(ctx, card.id, action.phaseId);
      break;
    case 'create_card': {
      var target = Db.get('pipes', action.pipeId);
      if (!target) throw new Error('Pipe de destino não existe mais.');
      var values = {};
      if (action.copyValues) {
        var source = allPipeFields(card.pipeId);
        (target.startFields || []).forEach(function (tf) {
          var sf = source.filter(function (f) { return f.label.toLowerCase() === tf.label.toLowerCase(); })[0];
          if (sf && card.values[sf.id] !== undefined) values[tf.id] = card.values[sf.id];
        });
      }
      var created = createCard(ctx, target.id, values, { title: card.title, phaseId: action.phaseId });
      logActivity(ctx, card, 'card_spawned', { cardId: created.id, pipeId: target.id });
      break;
    }
    case 'send_email': {
      var to = fillTemplate(action.to, card).split(/[,;\s]+/).filter(function (e) { return /@/.test(e); });
      if (!to.length) throw new Error('Nenhum destinatário válido para o e-mail.');
      if (MailApp.getRemainingDailyQuota() < to.length) throw new Error('Cota diária de e-mails esgotada.');
      MailApp.sendEmail({
        to: to.join(','),
        subject: fillTemplate(action.subject || 'Fluxo: {{titulo}}', card),
        body: fillTemplate(action.body || '', card),
        name: 'Fluxo'
      });
      logActivity(ctx, card, 'email_sent', { to: to });
      break;
    }
    case 'assign': {
      var set = (card.assignees || []).slice();
      (action.userIds || []).forEach(function (id) { if (set.indexOf(id) < 0) set.push(id); });
      updateCard(ctx, card.id, { assignees: set });
      break;
    }
    case 'set_field': {
      var patch = {};
      patch[action.fieldId] = action.value;
      updateCard(ctx, card.id, { values: patch });
      break;
    }
    case 'add_label': {
      var labels = (card.labels || []).slice();
      if (action.labelId && labels.indexOf(action.labelId) < 0) labels.push(action.labelId);
      updateCard(ctx, card.id, { labels: labels });
      break;
    }
    case 'comment':
      Db.insert('comments', {
        id: newId('m'), cardId: card.id, userId: 'automation',
        text: fillTemplate(action.text, card), createdAt: nowIso()
      });
      break;
    default:
      throw new Error('Ação desconhecida: ' + action.type);
  }
}

/** Verificação periódica de SLA e vencimentos (gatilho de hora em hora). */
function runScheduledChecks() {
  Db.reset();
  var phases = Db.all('phases');
  var cards = Db.where('cards', function (c) { return !isTrue(c.archived); });
  var fired = 0;
  cards.forEach(function (card) {
    var state = cardLateness(card, phases);
    var flags = card.flags || {};
    var ctx = systemCtx(null);
    ctx.depth = 0;
    var phase = phases.filter(function (h) { return h.id === card.phaseId; })[0];
    var sla = phase && Number(phase.slaHours) > 0 &&
      (Date.now() - new Date(card.phaseEnteredAt).getTime()) / 3600000 > Number(phase.slaHours);
    if (sla && !isTrue(phase.isDone) && flags.slaNotified !== card.phaseEnteredAt) {
      flags.slaNotified = card.phaseEnteredAt;
      Db.update('cards', card.id, { flags: flags });
      runAutomations(ctx, 'sla_late', Db.get('cards', card.id), { phaseId: card.phaseId });
      fired++;
    }
    if (state.overdue && flags.dueNotified !== card.dueDate) {
      flags.dueNotified = card.dueDate;
      Db.update('cards', card.id, { flags: flags });
      runAutomations(ctx, 'due_overdue', Db.get('cards', card.id), {});
      fired++;
    }
  });
  return { checked: cards.length, fired: fired };
}

/** Função chamada pelo gatilho de tempo. */
function scheduledJob() {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    return runScheduledChecks();
  } finally {
    lock.releaseLock();
  }
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scheduledJob').timeBased().everyHours(1).create();
  return true;
}

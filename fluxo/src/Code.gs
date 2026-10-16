/**
 * Fluxo — gestão de processos em pipes (kanban, formulários, automações, SLA,
 * relatórios, formulários públicos e databases) em Google Apps Script.
 */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var tpl = HtmlService.createTemplateFromFile('Index');
  tpl.formToken = params.form ? String(params.form) : '';
  tpl.appUrl = ScriptApp.getService().getUrl();
  return tpl.evaluate()
    .setTitle('Fluxo')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Métodos que exigem sessão válida. `admin: true` restringe a administradores. */
var API = {
  'auth.me': { fn: function (ctx) { return publicUser(ctx.user); } },
  'auth.logout': { fn: function (ctx) { return logout(ctx.token); } },
  'auth.changePassword': { fn: function (ctx, a) { return changePassword(ctx.user, a.current, a.next); } },

  'bootstrap': { fn: function (ctx) { return bootstrap(ctx); } },

  'users.list': { fn: function () { return listUsers(); } },
  'users.create': { admin: true, fn: function (ctx, a) { return createUserByAdmin(a); } },
  'users.update': { admin: true, fn: function (ctx, a) { return updateUser(ctx, a.id, a.patch); } },
  'users.resetPassword': { admin: true, fn: function (ctx, a) { return resetPassword(a.id, a.password); } },

  'pipes.save': { admin: true, fn: function (ctx, a) { return savePipe(ctx, a.pipe); } },
  'pipes.delete': { admin: true, fn: function (ctx, a) { return deletePipe(a.id); } },
  'pipes.get': { fn: function (ctx, a) { return getPipeBundle(ctx, a.id); } },
  'pipes.createFromTemplate': { admin: true, fn: function (ctx, a) { return createPipeFromTemplate(ctx, a.template, a.name); } },
  'phases.save': { admin: true, fn: function (ctx, a) { return savePhase(ctx, a.phase); } },
  'phases.delete': { admin: true, fn: function (ctx, a) { return deletePhase(a.id); } },
  'phases.reorder': { admin: true, fn: function (ctx, a) { return reorderPhases(a.pipeId, a.ids); } },

  'cards.create': { fn: function (ctx, a) { return createCard(ctx, a.pipeId, a.values, a.extra); } },
  'cards.get': { fn: function (ctx, a) { return getCardDetail(ctx, a.id); } },
  'cards.update': { fn: function (ctx, a) { return updateCard(ctx, a.id, a.patch); } },
  'cards.move': { fn: function (ctx, a) { return moveCard(ctx, a.id, a.phaseId); } },
  'cards.delete': { fn: function (ctx, a) { return deleteCard(ctx, a.id); } },
  'cards.comment': { fn: function (ctx, a) { return addComment(ctx, a.id, a.text); } },

  'files.upload': { fn: function (ctx, a) { return uploadFile(a.name, a.mimeType, a.data); } },
  'files.download': { fn: function (ctx, a) { return downloadFile(a.id); } },

  'automations.list': { fn: function (ctx, a) { return listAutomations(a.pipeId); } },
  'automations.save': { admin: true, fn: function (ctx, a) { return saveAutomation(a.automation); } },
  'automations.delete': { admin: true, fn: function (ctx, a) { Db.remove('automations', a.id); return true; } },
  'automations.runScheduled': { admin: true, fn: function () { return runScheduledChecks(); } },

  'tables.list': { fn: function () { return Db.all('tables'); } },
  'tables.save': { admin: true, fn: function (ctx, a) { return saveTable(a.table); } },
  'tables.delete': { admin: true, fn: function (ctx, a) { return deleteTable(a.id); } },
  'records.list': { fn: function (ctx, a) { return listRecords(a.tableId); } },
  'records.save': { fn: function (ctx, a) { return saveRecord(ctx, a.record); } },
  'records.delete': { fn: function (ctx, a) { Db.remove('records', a.id); return true; } },

  'demo.seed': { admin: true, fn: function (ctx) { return seedDemo(ctx); } },
  'setup.installTriggers': { admin: true, fn: function () { return installTriggers(); } }
};

/** Ponto de entrada único do cliente autenticado. */
function api(token, method, args) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    Db.reset();
    var def = API[method];
    if (!def) throw new Error('Método inválido: ' + method);
    var user = userFromToken(token);
    if (!user) return { ok: false, error: 'SESSION_EXPIRED' };
    if (def.admin && user.role !== 'admin') throw new Error('Apenas administradores podem fazer isso.');
    var ctx = { user: user, token: token, depth: 0 };
    return { ok: true, data: def.fn(ctx, args || {}) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    lock.releaseLock();
  }
}

/** Métodos sem sessão: login, cadastro e formulário público. */
function publicApi(method, args) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    Db.reset();
    args = args || {};
    var data;
    switch (method) {
      case 'login': data = login(args.email, args.password); break;
      case 'register': data = register(args.email, args.name, args.password); break;
      case 'status': data = { hasUsers: Db.all('users').length > 0 }; break;
      case 'form.get': data = getPublicForm(args.token); break;
      case 'form.submit': data = submitPublicForm(args.token, args.values); break;
      case 'form.upload': data = uploadPublicFile(args.token, args.name, args.mimeType, args.data); break;
      default: throw new Error('Método inválido: ' + method);
    }
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    lock.releaseLock();
  }
}

function bootstrap(ctx) {
  var pipes = visiblePipes(ctx.user);
  var cards = Db.where('cards', function (c) { return !c.archived; });
  var phases = Db.all('phases');
  var summary = pipes.map(function (p) {
    var pipeCards = cards.filter(function (c) { return c.pipeId === p.id; });
    var donePhases = phases.filter(function (ph) { return ph.pipeId === p.id && isTrue(ph.isDone); })
      .map(function (ph) { return ph.id; });
    var open = pipeCards.filter(function (c) { return donePhases.indexOf(c.phaseId) < 0; });
    return {
      pipe: p,
      total: pipeCards.length,
      open: open.length,
      late: open.filter(function (c) { return cardLateness(c, phases).late; }).length
    };
  });
  return {
    user: publicUser(ctx.user),
    users: listUsers(),
    pipes: summary,
    tables: Db.all('tables'),
    appUrl: ScriptApp.getService().getUrl()
  };
}

function isTrue(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1;
}

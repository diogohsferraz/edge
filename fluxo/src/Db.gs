/**
 * Camada de dados: cada tabela é uma aba da planilha de banco de dados.
 * A primeira linha guarda os nomes das colunas; colunas JSON são serializadas.
 */
var SCHEMA = {
  users: {
    cols: ['id', 'email', 'name', 'passwordHash', 'salt', 'role', 'active', 'createdAt'],
    json: []
  },
  sessions: { cols: ['id', 'userId', 'expiresAt', 'createdAt'], json: [] },
  pipes: {
    cols: ['id', 'name', 'description', 'color', 'members', 'startFields', 'labels',
      'publicForm', 'publicToken', 'createdAt', 'createdBy', 'archived'],
    json: ['members', 'startFields', 'labels']
  },
  phases: {
    cols: ['id', 'pipeId', 'name', 'order', 'fields', 'slaHours', 'isDone', 'description'],
    json: ['fields']
  },
  cards: {
    cols: ['id', 'pipeId', 'phaseId', 'title', 'values', 'assignees', 'labels', 'dueDate',
      'phaseEnteredAt', 'history', 'flags', 'createdAt', 'createdBy', 'updatedAt', 'doneAt', 'archived'],
    json: ['values', 'assignees', 'labels', 'history', 'flags']
  },
  comments: { cols: ['id', 'cardId', 'userId', 'text', 'createdAt'], json: [] },
  activity: { cols: ['id', 'pipeId', 'cardId', 'userId', 'type', 'data', 'createdAt'], json: ['data'] },
  automations: {
    cols: ['id', 'pipeId', 'name', 'active', 'trigger', 'conditions', 'actions', 'runs', 'lastRunAt', 'createdAt'],
    json: ['trigger', 'conditions', 'actions']
  },
  tables: { cols: ['id', 'name', 'description', 'fields', 'titleFieldId', 'createdAt'], json: ['fields'] },
  records: { cols: ['id', 'tableId', 'values', 'createdAt', 'createdBy', 'updatedAt'], json: ['values'] }
};

var Db = (function () {
  var ss_ = null;
  var memo_ = {};

  function spreadsheet() {
    if (ss_) return ss_;
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('DB_ID');
    if (id) {
      ss_ = SpreadsheetApp.openById(id);
    } else {
      ss_ = SpreadsheetApp.create('Fluxo — Banco de dados');
      props.setProperty('DB_ID', ss_.getId());
    }
    return ss_;
  }

  function sheet(name) {
    var def = SCHEMA[name];
    if (!def) throw new Error('Tabela desconhecida: ' + name);
    var ss = spreadsheet();
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols]).setFontWeight('bold');
      sh.setFrozenRows(1);
      var first = ss.getSheets()[0];
      if (first.getName() === 'Sheet1' || first.getName() === 'Página1' || first.getName() === 'Planilha1') {
        if (ss.getSheets().length > 1) ss.deleteSheet(first);
      }
    }
    return sh;
  }

  function encode(def, obj) {
    return def.cols.map(function (c) {
      var v = obj[c];
      if (def.json.indexOf(c) >= 0) v = JSON.stringify(v === undefined ? null : v);
      if (v === undefined || v === null) return '';
      // O apóstrofo força texto: impede fórmulas e a conversão automática de datas e números.
      if (typeof v === 'string' && v !== '') return "'" + v;
      return v;
    });
  }

  function decode(def, row) {
    var obj = {};
    def.cols.forEach(function (c, i) {
      var v = row[i];
      if (v instanceof Date) v = v.toISOString();
      if (def.json.indexOf(c) >= 0) {
        try { v = v === '' ? null : JSON.parse(v); } catch (e) { v = null; }
      }
      obj[c] = v;
    });
    return obj;
  }

  function load(name) {
    if (memo_[name]) return memo_[name];
    var def = SCHEMA[name];
    var sh = sheet(name);
    var last = sh.getLastRow();
    var rows = last > 1 ? sh.getRange(2, 1, last - 1, def.cols.length).getValues() : [];
    var list = [];
    rows.forEach(function (r, i) {
      if (r[0] === '' || r[0] === null) return;
      var o = decode(def, r);
      o._row = i + 2;
      list.push(o);
    });
    memo_[name] = list;
    return list;
  }

  function strip(o) {
    if (!o) return o;
    var c = {};
    Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; });
    return c;
  }

  return {
    spreadsheet: spreadsheet,
    reset: function () { memo_ = {}; },
    all: function (name) { return load(name).map(strip); },
    where: function (name, pred) { return load(name).filter(pred).map(strip); },
    get: function (name, id) {
      var list = load(name);
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return strip(list[i]);
      return null;
    },
    insert: function (name, obj) {
      var def = SCHEMA[name];
      if (!obj.id) obj.id = newId(name.charAt(0));
      var sh = sheet(name);
      var list = load(name);
      var row = sh.getLastRow() + 1;
      sh.getRange(row, 1, 1, def.cols.length).setValues([encode(def, obj)]);
      var stored = strip(obj);
      stored._row = row;
      list.push(stored);
      return strip(stored);
    },
    update: function (name, id, patch) {
      var def = SCHEMA[name];
      var list = load(name);
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          var o = list[i];
          Object.keys(patch).forEach(function (k) { if (k !== 'id' && k !== '_row') o[k] = patch[k]; });
          sheet(name).getRange(o._row, 1, 1, def.cols.length).setValues([encode(def, o)]);
          return strip(o);
        }
      }
      throw new Error('Registro não encontrado: ' + name + '/' + id);
    },
    remove: function (name, id) {
      var list = load(name);
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          var row = list[i]._row;
          sheet(name).deleteRow(row);
          list.splice(i, 1);
          list.forEach(function (o) { if (o._row > row) o._row--; });
          return true;
        }
      }
      return false;
    },
    removeWhere: function (name, pred) {
      var self = this;
      load(name).filter(pred).map(function (o) { return o.id; }).forEach(function (id) { self.remove(name, id); });
    }
  };
})();

function newId(prefix) {
  return (prefix || 'x') + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function nowIso() {
  return new Date().toISOString();
}

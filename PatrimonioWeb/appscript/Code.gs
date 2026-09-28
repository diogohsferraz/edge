/**
 * Patrimônio — versão Google Apps Script.
 *
 * Os dados ficam numa Planilha Google, uma aba por tipo de registro:
 *   Instituições, Investimentos, Saldos, Movimentações, Orçamento e Config.
 * Você pode abrir a planilha, conferir e até editar os dados diretamente.
 *
 * Instalação: veja o README.md desta pasta.
 */

var TABS = [
  {
    key: 'institutions', name: 'Instituições',
    cols: [['id', 'ID'], ['name', 'Nome'], ['color', 'Cor']],
  },
  {
    key: 'assets', name: 'Investimentos',
    cols: [['id', 'ID'], ['name', 'Nome'], ['classId', 'Classe'], ['institutionId', 'ID da instituição'], ['ticker', 'Ticker'],
      ['indexer', 'Indexador'], ['maturity', 'Vencimento', 'date'], ['notes', 'Observações'], ['archived', 'Arquivado'], ['createdAt', 'Criado em', 'date']],
  },
  {
    key: 'snapshots', name: 'Saldos',
    cols: [['id', 'ID'], ['assetId', 'ID do investimento'], ['date', 'Data', 'date'], ['value', 'Saldo', 'money']],
  },
  {
    key: 'movements', name: 'Movimentações',
    cols: [['id', 'ID'], ['assetId', 'ID do investimento'], ['date', 'Data', 'date'], ['kind', 'Tipo'], ['amount', 'Valor', 'money'], ['note', 'Observação']],
  },
  {
    key: 'transactions', name: 'Orçamento',
    cols: [['id', 'ID'], ['date', 'Data', 'date'], ['amount', 'Valor', 'money'], ['category', 'Categoria'], ['income', 'Receita'], ['note', 'Descrição'], ['ref', 'Ref. extrato']],
  },
];
var CONFIG_TAB = 'Config';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Patrimônio')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Planilha onde os dados ficam. */
function getSpreadsheet_() {
  // Script criado a partir da planilha (Extensões › Apps Script): usa a própria planilha.
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
  if (active) return active;

  // Script independente: cria (uma vez) a planilha "Patrimônio - Dados" no seu Drive.
  var props = PropertiesService.getUserProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* planilha apagada: cria outra */ }
  }
  var ss = SpreadsheetApp.create('Patrimônio - Dados');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function tz_(ss) {
  return ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
}

function toISO_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v || '').trim();
  var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return s ? s.slice(0, 10) : null;
}

function fromISO_(s) {
  if (!s) return '';
  var p = String(s).split('-');
  // Meio-dia evita troca de dia por diferença de fuso.
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
}

/** Lê todas as abas e devolve o JSON usado pela interface. */
function getData() {
  var ss = getSpreadsheet_();
  var tz = tz_(ss);
  var data = {};
  var hasAny = false;
  TABS.forEach(function (tab) {
    var sheet = ss.getSheetByName(tab.name);
    data[tab.key] = [];
    if (!sheet || sheet.getLastRow() < 2) return;
    hasAny = true;
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, tab.cols.length).getValues();
    values.forEach(function (row) {
      if (!row[0]) return;
      var obj = {};
      tab.cols.forEach(function (c, i) {
        var v = row[i];
        if (c[2] === 'date') v = toISO_(v, tz);
        else if (c[0] === 'archived' || c[0] === 'income') v = v === true || String(v).toUpperCase() === 'TRUE' || v === 'Sim';
        else if (c[2] === 'money') v = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
        else v = v === null || v === undefined ? '' : String(v);
        obj[c[0]] = v;
      });
      data[tab.key].push(obj);
    });
  });

  var config = ss.getSheetByName(CONFIG_TAB);
  data.settings = {};
  data.benchmarks = {};
  if (config && config.getLastRow() >= 1) {
    hasAny = true;
    config.getRange(1, 1, config.getLastRow(), 2).getValues().forEach(function (r) {
      var k = String(r[0] || '');
      if (k === 'goal') data.settings.goal = Number(r[1]) || 0;
      if (k === 'hideValues') data.settings.hideValues = r[1] === true || String(r[1]).toUpperCase() === 'TRUE';
      if (k === 'cardItemized') data.settings.cardItemized = r[1] === true || String(r[1]).toUpperCase() === 'TRUE';
      if (k === 'categoryRules') {
        try { data.settings.categoryRules = JSON.parse(r[1]); } catch (e) { data.settings.categoryRules = {}; }
      }
      if (k === 'benchmarks') {
        try { data.benchmarks = JSON.parse(r[1]); } catch (e) { data.benchmarks = {}; }
      }
    });
  }
  return hasAny ? JSON.stringify(data) : null;
}

/** Recebe o JSON da interface e regrava as abas. */
function saveData(json) {
  var data = JSON.parse(json);
  var lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    var ss = getSpreadsheet_();
    TABS.forEach(function (tab) {
      var sheet = ss.getSheetByName(tab.name) || ss.insertSheet(tab.name);
      var rows = (data[tab.key] || []).map(function (obj) {
        return tab.cols.map(function (c) {
          var v = obj[c[0]];
          if (c[2] === 'date') return v ? fromISO_(v) : '';
          if (c[0] === 'archived' || c[0] === 'income') return v === true;
          if (c[2] === 'money') return Number(v) || 0;
          return v === null || v === undefined ? '' : String(v);
        });
      });
      var header = tab.cols.map(function (c) { return c[1]; });
      sheet.clearContents();
      sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      if (rows.length) {
        sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
        tab.cols.forEach(function (c, i) {
          var range = sheet.getRange(2, i + 1, rows.length, 1);
          if (c[2] === 'date') range.setNumberFormat('dd/mm/yyyy');
          if (c[2] === 'money') range.setNumberFormat('#,##0.00');
        });
      }
    });

    var config = ss.getSheetByName(CONFIG_TAB) || ss.insertSheet(CONFIG_TAB);
    config.clearContents();
    var s = data.settings || {};
    config.getRange(1, 1, 5, 2).setValues([
      ['goal', Number(s.goal) || 0],
      ['hideValues', s.hideValues === true],
      ['cardItemized', s.cardItemized === true],
      ['categoryRules', JSON.stringify(s.categoryRules || {})],
      ['benchmarks', JSON.stringify(data.benchmarks || {})],
    ]);

    // Remove a aba vazia padrão de uma planilha recém-criada.
    var def = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
    if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  } finally {
    lock.releaseLock();
  }
  return true;
}

/** CDI (4391) e IPCA (433) da API do Banco Central — feito no servidor, sem problema de CORS. */
function fetchSeries(code) {
  code = Number(code);
  if ([4391, 433].indexOf(code) < 0) throw new Error('Série não permitida');
  var fmt = function (d) { return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy'); };
  var end = new Date();
  var start = new Date(end.getFullYear() - 10, end.getMonth(), 1);
  var url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + code + '/dados?formato=json&dataInicial=' + fmt(start) + '&dataFinal=' + fmt(end);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Banco Central respondeu ' + res.getResponseCode());
  return res.getContentText();
}

/** Salva um arquivo exportado (CSV/JSON) no Google Drive e devolve o link. */
function exportToDrive(name, content) {
  var mime = /\.json$/i.test(name) ? MimeType.PLAIN_TEXT : MimeType.CSV;
  var file = DriveApp.createFile(name, '﻿' + content, mime);
  return file.getUrl();
}

function getInfo() {
  var ss = getSpreadsheet_();
  return JSON.stringify({ name: ss.getName(), url: ss.getUrl() });
}

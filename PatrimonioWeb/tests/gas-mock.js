// Simulação mínima dos serviços do Google Apps Script para testar appscript/Code.gs fora do Google.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeSheet(name) {
  const cells = []; // cells[r][c], base 0
  const sheet = {
    name,
    formats: {},
    getName: () => name,
    getLastRow: () => {
      for (let r = cells.length - 1; r >= 0; r--) if (cells[r] && cells[r].some((v) => v !== '' && v !== undefined && v !== null)) return r + 1;
      return 0;
    },
    clearContents: () => (cells.length = 0),
    setFrozenRows: () => sheet,
    getRange: (row, col, nr = 1, nc = 1) => ({
      getValues: () =>
        Array.from({ length: nr }, (_, i) =>
          Array.from({ length: nc }, (_, j) => {
            const v = (cells[row - 1 + i] || [])[col - 1 + j];
            return v === undefined ? '' : v instanceof Date ? new Date(v) : v;
          })
        ),
      setValues(values) {
        values.forEach((r, i) =>
          r.forEach((v, j) => {
            cells[row - 1 + i] = cells[row - 1 + i] || [];
            cells[row - 1 + i][col - 1 + j] = v instanceof Date ? new Date(v) : v;
          })
        );
        return this;
      },
      setFontWeight() {
        return this;
      },
      setNumberFormat(f) {
        sheet.formats[col] = f;
        return this;
      },
    }),
    _cells: cells,
  };
  return sheet;
}

function makeSpreadsheet() {
  const sheets = [makeSheet('Página1')];
  return {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => {
      const s = makeSheet(n);
      sheets.push(s);
      return s;
    },
    getSheets: () => sheets.slice(),
    deleteSheet: (s) => sheets.splice(sheets.indexOf(s), 1),
    getSpreadsheetTimeZone: () => 'America/Sao_Paulo',
    getName: () => 'Patrimônio - Dados',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/mock',
    getId: () => 'mock',
    _sheets: sheets,
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Carrega Code.gs num contexto isolado com os serviços simulados. */
function loadGas(options = {}) {
  const ss = makeSpreadsheet();
  const files = [];
  const ctx = {
    console,
    JSON,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, create: () => ss },
    PropertiesService: { getUserProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    LockService: { getUserLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Utilities: {
      formatDate: (d, tz, fmt) =>
        fmt.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())),
    },
    UrlFetchApp: {
      fetch: () => {
        if (options.fetchText) return { getResponseCode: () => 200, getContentText: () => options.fetchText };
        throw new Error('sem rede no teste');
      },
    },
    DriveApp: { createFile: (name, content) => (files.push({ name, content }), { getUrl: () => 'https://drive.google.com/mock/' + name }) },
    MimeType: { CSV: 'text/csv', PLAIN_TEXT: 'text/plain' },
    HtmlService: {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'appscript', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  return { ctx, ss, files };
}

module.exports = { loadGas };

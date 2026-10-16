/**
 * Servidor de desenvolvimento: executa os arquivos .gs em Node com simulações
 * dos serviços do Apps Script (planilha em memória, Drive, e-mail) e serve a
 * interface com um `google.script.run` que chama o servidor por HTTP.
 *
 *   node fluxo/dev/server.js [porta]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'src');
const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const BASE_URL = `http://localhost:${PORT}/`;

/* ---------- Simulações ---------- */
function makeSheet(name) {
  let rows = [];
  const sheet = {
    getName: () => name,
    getLastRow: () => rows.length,
    setFrozenRows: () => sheet,
    deleteRow: (r) => { rows.splice(r - 1, 1); },
    getRange: (row, col, nr = 1, nc = 1) => ({
      setValues(values) {
        values.forEach((vals, i) => {
          const r = row - 1 + i;
          while (rows.length <= r) rows.push([]);
          vals.forEach((v, j) => {
            // Imita o Sheets: apóstrofo força texto; senão números e datas são convertidos.
            if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1);
            else if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) v = Number(v);
            else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) v = new Date(v);
            rows[r][col - 1 + j] = v;
          });
        });
        return this;
      },
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const src = rows[row - 1 + i] || [];
          const line = [];
          for (let j = 0; j < nc; j++) { const v = src[col - 1 + j]; line.push(v === undefined ? '' : v); }
          out.push(line);
        }
        return out;
      },
      setFontWeight() { return this; }
    })
  };
  return sheet;
}
function makeSpreadsheet() {
  const sheets = [makeSheet('Sheet1')];
  return {
    getId: () => 'ss_dev',
    getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null,
    insertSheet: (n) => { const s = makeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
    deleteSheet: (s) => { sheets.splice(sheets.indexOf(s), 1); }
  };
}

const props = {};
const files = {};
const mails = [];
const triggers = [];
let spreadsheet = null;

function blob(bytes, mime, name) {
  return {
    bytes, mime, name,
    getContentType: () => mime, getBytes: () => bytes, getName: () => name
  };
}

const services = {
  SpreadsheetApp: {
    create: () => (spreadsheet = makeSpreadsheet()),
    openById: () => spreadsheet || (spreadsheet = makeSpreadsheet())
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); }
    })
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (alg, text) => Array.from(crypto.createHash(alg).update(String(text), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('base64'),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b)),
    newBlob: (bytes, mime, name) => blob(bytes, mime, name),
    sleep: () => {}
  },
  DriveApp: {
    createFolder: () => ({ getId: () => 'folder_dev' }),
    getFolderById: () => ({ getId: () => 'folder_dev' }),
    getFileById: (id) => {
      const f = files[id];
      if (!f) throw new Error('Arquivo não encontrado');
      let given = false;
      return {
        getName: () => f.name, getBlob: () => f,
        getParents: () => ({ hasNext: () => !given, next: () => { given = true; return { getId: () => 'folder_dev' }; } })
      };
    }
  },
  MailApp: {
    getRemainingDailyQuota: () => 100,
    sendEmail: (m) => { mails.push(m); console.log('[e-mail]', m.to, '|', m.subject); }
  },
  ScriptApp: {
    getService: () => ({ getUrl: () => BASE_URL }),
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
    newTrigger: (fn) => ({ timeBased: () => ({ everyHours: () => ({ create: () => { triggers.push({ getHandlerFunction: () => fn }); } }) }) })
  }
};
// Pasta de anexos: createFile guarda em memória.
const folder = { getId: () => 'folder_dev', createFile: (b) => { const id = 'file_' + crypto.randomUUID().slice(0, 8); files[id] = b; return { getId: () => id, getName: () => b.name }; } };
services.DriveApp.createFolder = () => folder;
services.DriveApp.getFolderById = () => folder;

const context = vm.createContext(Object.assign({ console, Date, JSON, Math }, services));
fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort().forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), context, { filename: f });
});

/* ---------- HTML ---------- */
const SHIM = `<script>
window.google = { script: {
  run: (function make(ok, ko) {
    return new Proxy({}, { get: function (_, fn) {
      if (fn === 'withSuccessHandler') return function (f) { return make(f, ko); };
      if (fn === 'withFailureHandler') return function (f) { return make(ok, f); };
      return function () {
        fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fn: fn, args: Array.prototype.slice.call(arguments) }) })
          .then(function (r) { return r.json(); })
          .then(function (r) { if (r.error) { ko && ko(new Error(r.error)); } else { ok && ok(r.result); } })
          .catch(function (e) { ko && ko(e); });
      };
    } });
  })(),
  history: { push: function (s, q, hash) { history.pushState(null, '', '#' + hash); }, setChangeHandler: function (fn) {
    window.addEventListener('popstate', function () { fn({ location: { hash: location.hash.slice(1) } }); }); } },
  url: { getLocation: function (cb) { cb({ hash: location.hash.slice(1), parameter: {} }); } }
} };
</script>`;

function renderIndex(formToken) {
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  html = html.replace(/<\?!= include\('(\w+)'\); \?>/g, (m, n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8'));
  html = html.replace('<?= formToken ?>', JSON.stringify(formToken || ''));
  html = html.replace('<?= appUrl ?>', JSON.stringify(BASE_URL));
  return html.replace('<head>', '<head>' + SHIM);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, BASE_URL);
  if (req.method === 'POST' && url.pathname === '/rpc') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let out;
      try {
        const { fn, args } = JSON.parse(body);
        if (!['api', 'publicApi', 'runScheduledChecks'].includes(fn)) throw new Error('Função não exposta: ' + fn);
        out = { result: JSON.parse(JSON.stringify(context[fn](...args))) };
      } catch (e) {
        out = { error: e.message };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  if (url.pathname === '/__mails') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(mails));
  }
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(renderIndex(url.searchParams.get('form')));
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log(`Fluxo (dev) em ${BASE_URL}`));
module.exports = { context, mails };

// Teste ponta a ponta da versão Apps Script: a página Index.html (renderizada como o Google faria)
// conversa com o Code.gs real via google.script.run simulado.
// Requer playwright-core e Chromium: node tests/e2e/appscript.e2e.js [pasta-de-screenshots]
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const { loadGas } = require('../gas-mock');

const root = path.resolve(__dirname, '..', '..');
const outDir = process.argv[2];
const read = (f) => fs.readFileSync(path.join(root, 'appscript', f), 'utf8');
const page_html = read('Index.html').replace(/<\?!= include\('(\w+)'\); \?>/g, (_, n) => read(n + '.html'));

(async () => {
  const gas = loadGas({ fetchText: JSON.stringify([{ data: '01/01/2026', valor: '1,16' }]) });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: 'pt-BR' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.exposeFunction('__gas', (fn, args) => {
    const r = gas.ctx[fn](...args);
    return r === undefined ? null : r;
  });
  await page.addInitScript(() => {
    const make = (ok, fail) =>
      new Proxy({}, {
        get(_, prop) {
          if (prop === 'withSuccessHandler') return (f) => make(f, fail);
          if (prop === 'withFailureHandler') return (f) => make(ok, f);
          return (...args) => window.__gas(prop, args).then((r) => ok && ok(r), (e) => fail && fail(e));
        },
      });
    window.google = { script: { run: make(null, null) } };
  });
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'web', 'vendor', 'chart.umd.min.js')) }));
  await page.route('https://script.test/', (route) => route.fulfill({ contentType: 'text/html', body: page_html }));
  await page.goto('https://script.test/');
  await page.waitForSelector('.empty');
  const label = await page.textContent('#storage-label');
  await page.click('[data-action="sample"]');
  await page.waitForSelector('#ch-evo');
  await page.waitForTimeout(1500); // debounce de gravação
  const saldos = gas.ss.getSheetByName('Saldos');
  const rowsSaved = saldos ? saldos.getLastRow() - 1 : 0;
  if (outDir) await page.screenshot({ path: path.join(outDir, 'appscript-dashboard.png') });

  // Recarrega a página: os dados devem vir da planilha.
  await page.reload();
  await page.waitForSelector('#ch-evo');
  const totalAfterReload = await page.textContent('.kpi-value');
  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(500);
  const info = await page.textContent('#storage-info');
  await page.click('[data-action="export-csv"]');
  await page.waitForSelector('.modal');
  const exportMsg = await page.textContent('.modal-body');
  if (outDir) await page.screenshot({ path: path.join(outDir, 'appscript-settings.png') });
  await browser.close();

  const result = { label, rowsSaved, totalAfterReload, info, exportMsg: exportMsg.trim(), driveFiles: gas.files.map((f) => f.name), errors };
  console.log(JSON.stringify(result, null, 2));
  const ok = label.includes('Planilha Google') && rowsSaved > 100 && /R\$/.test(totalAfterReload) && gas.files.length === 1 && !errors.length;
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

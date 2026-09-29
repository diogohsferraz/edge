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
  // CDN servido pelos arquivos locais (Chart.js e pdf.js).
  await page.route('https://cdn.jsdelivr.net/**', (route) => {
    const name = route.request().url().split('/').pop();
    const local = { 'chart.umd.min.js': 'chart.umd.min.js', 'pdf.min.js': 'pdf.min.js', 'pdf.worker.min.js': 'pdf.worker.min.js' }[name];
    route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'web', 'vendor', local)) });
  });
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
  // Com dados e sem senha, o app sugere proteger: "Agora não" fica gravado na planilha.
  await page.waitForSelector('.modal-head h2');
  const offer = await page.textContent('.modal-head h2');
  await page.click('.modal-foot .btn:not(.primary)');
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(500);
  const info = await page.textContent('#storage-info');
  // Fatura em PDF: o pdf.js é carregado do CDN sob demanda.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="import-invoice"]')]);
  await chooser.setFiles(path.join(root, 'tests', 'fixtures', 'fatura-bb-exemplo.pdf'));
  await page.waitForSelector('#inv-sel');
  await page.waitForTimeout(300);
  const invoiceSelected = await page.textContent('#inv-sel');
  await page.click('.modal-foot .btn.primary');
  await page.waitForTimeout(1500);
  const orc = gas.ss.getSheetByName('Orçamento');
  const invoiceRows = orc ? orc._cells.filter((r, i) => i > 0 && String(r[6] || '').startsWith('fatura:')).length : 0;
  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(300);
  await page.click('[data-action="export-csv"]');
  await page.waitForSelector('.modal');
  const exportMsg = await page.textContent('.modal-body');
  if (outDir) await page.screenshot({ path: path.join(outDir, 'appscript-settings.png') });
  await page.click('.modal-foot .btn');
  await page.waitForSelector('.modal', { state: 'detached' });

  // Usuário e senha: a planilha passa a ter só a aba Cofre, criptografada.
  await page.click('[data-action="protect-create"]');
  await page.fill('input[name="user"]', 'Diogo');
  await page.fill('input[name="password"]', 'segredo123');
  await page.fill('input[name="password2"]', 'segredo123');
  await page.check('input[name="ack"]');
  await page.click('.modal-foot .btn.primary');
  await page.waitForSelector('.modal', { state: 'detached' });
  const sheetsAfter = gas.ss._sheets.map((s) => s.name);
  const vaultText = JSON.stringify(gas.ss.getSheetByName('Cofre') ? gas.ss.getSheetByName('Cofre')._cells : []);
  await page.reload();
  await page.waitForSelector('.lock-screen');
  if (outDir) await page.screenshot({ path: path.join(outDir, 'appscript-lock.png') });
  await page.fill('.lock-screen input[name="user"]', 'diogo');
  await page.fill('.lock-screen input[name="password"]', 'segredo123');
  await page.click('.lock-screen button[type="submit"]');
  await page.waitForSelector('#ch-evo');
  const totalAfterLogin = await page.textContent('.kpi-value');
  // Bloquear agora: pede a senha de novo sem recarregar a página.
  await page.click('.nav-item[data-view="settings"]');
  await page.click('[data-action="lock-now"]');
  await page.waitForSelector('.lock-screen');
  const lockedAgain = await page.isVisible('.lock-screen');
  await browser.close();

  const result = { label, rowsSaved, totalAfterReload, totalAfterLogin, offer, sheetsAfter, lockedAgain, info, invoiceSelected, invoiceRows, exportMsg: exportMsg.trim(), driveFiles: gas.files.map((f) => f.name), errors };
  console.log(JSON.stringify(result, null, 2));
  const ok = label.includes('Planilha Google') && rowsSaved > 100 && /R\$/.test(totalAfterReload) && gas.files.length === 1 && invoiceRows === 13 && /1\.371,00/.test(invoiceSelected) &&
    /Proteja/.test(offer) && sheetsAfter.join() === 'Cofre' && !vaultText.includes('Tesouro') && totalAfterLogin === totalAfterReload && lockedAgain && !errors.length;
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

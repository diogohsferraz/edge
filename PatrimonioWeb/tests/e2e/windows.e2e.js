// Teste ponta a ponta do app Electron (roda também no Linux com xvfb):
//   xvfb-run node tests/e2e/windows.e2e.js [pasta-de-screenshots]
const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..', '..', 'windows');
const outDir = process.argv[2];
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-'));

async function launch() {
  const app = await electron.launch({
    executablePath: require(path.join(appDir, 'node_modules', 'electron')),
    args: ['--no-sandbox', appDir, '--user-data-dir=' + userData],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { app, page, errors };
}

(async () => {
  let { app, page, errors } = await launch();
  await page.waitForSelector('.empty');
  const label = await page.textContent('#storage-label');
  const hasBridge = await page.evaluate(() => typeof window.desktopAPI === 'object' && typeof window.require === 'undefined');
  await page.click('[data-action="sample"]');
  await page.waitForSelector('#ch-evo');
  await page.waitForTimeout(300);
  if (outDir) await page.screenshot({ path: path.join(outDir, 'windows-dashboard.png') });
  const total1 = await page.textContent('.kpi-value');
  // Fecha logo em seguida: o app deve gravar as pendências antes de sair.
  await app.close();
  const file = path.join(userData, 'dados.json');
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;

  ({ app, page, errors: errors } = await launch());
  await page.waitForSelector('#ch-evo');
  const total2 = await page.textContent('.kpi-value');
  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(300);
  const info = await page.textContent('#storage-info');
  if (outDir) await page.screenshot({ path: path.join(outDir, 'windows-settings.png') });
  await app.close();

  const result = { label, hasBridge, savedAssets: saved && saved.assets.length, total1, total2, info, backups: fs.existsSync(path.join(userData, 'backups')) ? fs.readdirSync(path.join(userData, 'backups')) : [], errors };
  console.log(JSON.stringify(result, null, 2));
  process.exit(label.includes('Este computador') && hasBridge && saved && saved.assets.length === 10 && total1 === total2 && !errors.length ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

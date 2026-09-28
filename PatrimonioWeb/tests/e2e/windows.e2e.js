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
  // Com dados e sem senha, o app sugere criar usuário e senha.
  await page.waitForSelector('.modal-head h2');
  const offer = await page.textContent('.modal-head h2');
  await page.click('.modal-foot .btn.primary');
  await page.waitForSelector('input[name="password2"]');
  await page.fill('input[name="user"]', 'Diogo');
  await page.fill('input[name="password"]', 'segredo123');
  await page.fill('input[name="password2"]', 'segredo123');
  await page.check('input[name="ack"]');
  await page.click('.modal-foot .btn.primary');
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(300);
  const info = await page.textContent('#storage-info');
  const security = await page.textContent('.card:has(> h3:text("Segurança"))');
  if (outDir) await page.screenshot({ path: path.join(outDir, 'windows-settings.png') });
  await app.close();
  const raw = fs.readFileSync(file, 'utf8');
  const bdir = path.join(userData, 'backups');
  const backupsSafe = fs.readdirSync(bdir).every((f) => !fs.readFileSync(path.join(bdir, f), 'utf8').includes('Tesouro'));
  const encrypted = raw.includes('patrimonio-cifrado') && !raw.includes('Tesouro') && backupsSafe;

  // Reabre: pede usuário e senha.
  ({ app, page, errors: errors } = await launch());
  await page.waitForSelector('.lock-screen');
  if (outDir) await page.screenshot({ path: path.join(outDir, 'windows-lock.png') });
  await page.fill('.lock-screen input[name="user"]', 'diogo');
  await page.fill('.lock-screen input[name="password"]', 'errada');
  await page.click('.lock-screen button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('.lock-error').textContent.length > 0);
  const wrong = await page.textContent('.lock-error');
  await page.fill('.lock-screen input[name="password"]', 'segredo123');
  await page.waitForFunction(() => !document.querySelector('.lock-screen button[type="submit"]').disabled);
  await page.click('.lock-screen button[type="submit"]');
  await page.waitForSelector('#ch-evo');
  const total3 = await page.textContent('.kpi-value');
  await app.close();

  const result = { label, hasBridge, savedAssets: saved && saved.assets.length, total1, total2, total3, offer, info, security, encrypted, wrong, backups: fs.existsSync(path.join(userData, 'backups')) ? fs.readdirSync(path.join(userData, 'backups')) : [], errors };
  console.log(JSON.stringify(result, null, 2));
  const ok = label.includes('Este computador') && hasBridge && saved && saved.assets.length === 10 && total1 === total2 && total2 === total3 &&
    /Proteja/.test(offer) && /Protegido/.test(security) && encrypted && /incorretos/.test(wrong) && !errors.length;
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

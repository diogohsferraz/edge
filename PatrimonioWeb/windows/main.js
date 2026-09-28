// Patrimônio para Windows (Electron). Os dados ficam em %APPDATA%\Patrimonio\dados.json.
const { app, BrowserWindow, ipcMain, dialog, shell, net, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const dataFile = () => path.join(app.getPath('userData'), 'dados.json');
const backupDir = () => path.join(app.getPath('userData'), 'backups');
let win = null;
let quitting = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1340,
    height: 900,
    minWidth: 380,
    minHeight: 520,
    title: 'Patrimônio',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f2f2f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'web', 'index.html'));

  // Links externos abrem no navegador padrão.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Garante que alterações pendentes sejam gravadas antes de fechar.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    const timeout = new Promise((r) => setTimeout(r, 3000));
    Promise.race([win.webContents.executeJavaScript('window.Patrimonio && Patrimonio.app.store && Patrimonio.app.store.flush()').catch(() => {}), timeout]).finally(() => {
      win.destroy();
    });
  });
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

/** Uma cópia por dia dos dados, mantendo as 30 mais recentes. */
function dailyBackup() {
  const src = dataFile();
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(backupDir(), { recursive: true });
  const dest = path.join(backupDir(), 'dados-' + new Date().toISOString().slice(0, 10) + '.json');
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  const all = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json')).sort();
  all.slice(0, Math.max(0, all.length - 30)).forEach((f) => fs.rmSync(path.join(backupDir(), f)));
}

ipcMain.handle('data:load', () => (fs.existsSync(dataFile()) ? fs.readFileSync(dataFile(), 'utf8') : null));
ipcMain.handle('data:save', (_e, json) => {
  JSON.parse(json); // não grava conteúdo inválido
  writeAtomic(dataFile(), json);
  return true;
});
ipcMain.handle('data:path', () => dataFile());
ipcMain.handle('net:fetchText', async (_e, url) => {
  if (!String(url).startsWith('https://api.bcb.gov.br/')) throw new Error('Endereço não permitido');
  const res = await net.fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
});
ipcMain.handle('file:save', async (_e, name, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name) });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
});
ipcMain.handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    try {
      dailyBackup();
    } catch (e) {
      console.error(e);
    }
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

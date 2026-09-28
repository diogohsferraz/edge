// Ponte segura entre a interface e o sistema de arquivos do Windows.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (json) => ipcRenderer.invoke('data:save', json),
  dataPath: () => ipcRenderer.invoke('data:path'),
  fetchText: (url) => ipcRenderer.invoke('net:fetchText', url),
  saveFile: (name, content) => ipcRenderer.invoke('file:save', name, content),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  resetBackups: () => ipcRenderer.invoke('backups:reset'),
});

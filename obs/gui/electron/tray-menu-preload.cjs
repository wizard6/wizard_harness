const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayMenu', {
  act: (id) => ipcRenderer.send('tray-menu-action', id),
  ready: (height) => ipcRenderer.send('tray-menu-ready', height),
});

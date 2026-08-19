const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wh', {
  getState: () => ipcRenderer.invoke('wh:get-state'),
  openPlugin: (id) => ipcRenderer.invoke('wh:open-plugin', id),
  windowControl: (action) => ipcRenderer.send('wh:window-control', action),
});

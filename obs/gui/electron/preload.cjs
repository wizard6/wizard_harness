const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wh', {
  getState: () => ipcRenderer.invoke('wh:get-state'),
  openPlugin: (id) => ipcRenderer.invoke('wh:open-plugin', id),
});

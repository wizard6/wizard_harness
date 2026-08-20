const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wh', {
  getState: () => ipcRenderer.invoke('wh:get-state'),
  openPlugin: (id) => ipcRenderer.invoke('wh:open-plugin', id),
  reloadPlugin: (id) => ipcRenderer.invoke('wh:reload-plugin', id),
  unregisterPlugin: (id) => ipcRenderer.invoke('wh:unregister-plugin', id),
  openQuality: () => ipcRenderer.invoke('wh:open-quality'),
  qualityData: () => ipcRenderer.invoke('wh:quality-data'),
  windowControl: (action) => ipcRenderer.send('wh:window-control', action),
});

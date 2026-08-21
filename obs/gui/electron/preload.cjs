const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wh', {
  getState: () => ipcRenderer.invoke('wh:get-state'),
  openPlugin: (id) => ipcRenderer.invoke('wh:open-plugin', id),
  reloadPlugin: (id) => ipcRenderer.invoke('wh:reload-plugin', id),
  unregisterPlugin: (id) => ipcRenderer.invoke('wh:unregister-plugin', id),
  scanPlugins: () => ipcRenderer.invoke('wh:scan-plugins'),
  openQuality: () => ipcRenderer.invoke('wh:open-quality'),
  qualityData: () => ipcRenderer.invoke('wh:quality-data'),
  rerunCheck: () => ipcRenderer.invoke('wh:rerun-check'),
  openFile: (rel) => ipcRenderer.invoke('wh:open-file', rel),
  windowControl: (action) => ipcRenderer.send('wh:window-control', action),
});

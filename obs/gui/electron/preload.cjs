const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wh', {
  getState: () => ipcRenderer.invoke('wh:get-state'),
  openPlugin: (id) => ipcRenderer.invoke('wh:open-plugin', id),
  reloadPlugin: (id) => ipcRenderer.invoke('wh:reload-plugin', id),
  unregisterPlugin: (id) => ipcRenderer.invoke('wh:unregister-plugin', id),
  scanPlugins: () => ipcRenderer.invoke('wh:scan-plugins'),
  callService: (service, method, args) => ipcRenderer.invoke('wh:call-service', { service, method, args }),
  openQuality: () => ipcRenderer.invoke('wh:open-quality'),
  openDemo: () => ipcRenderer.invoke('wh:open-demo'),
  qualityData: () => ipcRenderer.invoke('wh:quality-data'),
  rerunCheck: () => ipcRenderer.invoke('wh:rerun-check'),
  openFile: (rel) => ipcRenderer.invoke('wh:open-file', rel),
  windowControl: (action) => ipcRenderer.send('wh:window-control', action),
});

// 非 trusted 插件弹窗 preload：仅暴露低风险的事件历史（无命令执行能力）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wh', {
  eventsHistory: () => ipcRenderer.invoke('wh:events-history'),
  eventsClear: () => ipcRenderer.invoke('wh:events-clear'),
  windowControl: (action) => ipcRenderer.send('wh:window-control', action),
  call: (service, method, args) => ipcRenderer.invoke('wh:plugin-call', { service, method, args }),
});

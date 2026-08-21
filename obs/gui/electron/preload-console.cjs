// 插件弹窗 preload：暴露命令执行与事件历史通道
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wh', {
  execCommand: (command) => ipcRenderer.invoke('wh:exec-command', command),
  eventsHistory: () => ipcRenderer.invoke('wh:events-history'),
  eventsClear: () => ipcRenderer.invoke('wh:events-clear'),
  windowControl: (action) => ipcRenderer.send('wh:window-control', action),
});

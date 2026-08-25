/** 轮询 eventsHistory，监听 code-editor/changed 以跨弹窗同步文件内容 */
export const FILE_SYNC_JS = [
  'var fileSyncCursor=0,fileSyncTimer=null;',
  'function normPath(p){return String(p||"").replace(/\\\\/g,"/");}',
  'function startFileSync(onChange){',
  'if(!window.wh||!window.wh.eventsHistory)return;',
  'if(fileSyncTimer)clearInterval(fileSyncTimer);',
  'fileSyncTimer=setInterval(async function(){',
  'try{var events=await window.wh.eventsHistory();if(!Array.isArray(events))return;',
  'for(var i=fileSyncCursor;i<events.length;i++){var e=events[i];',
  'if(e.action==="code-editor/changed"&&e.payload&&e.payload.path)onChange(e.payload,e);}',
  'fileSyncCursor=events.length;}catch(err){}',
  '},350);}',
].join('');

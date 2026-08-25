/** 链路/决策树面板 HTML 片段（并入 page.ts 以控制单文件体积） */
export const TREE_PANEL_HTML = [
  '<div class="tree-bar">',
  '<label>执行实例</label><select id="flowPick"><option value="">（选择）</option></select>',
  '<button type="button" class="btn" id="demoChain">示例链条</button>',
  '<button type="button" class="btn" id="demoTree">示例决策树</button>',
  '</div>',
  '<div class="tree-wrap" id="treeWrap"><div class="empty">选择任务触发后，可在此查看链路/决策树</div></div>',
].join('');

export const TREE_PANEL_CSS = [
  '.tree-bar{flex:none;padding:8px 12px;border-bottom:1px solid #262634;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
  '.tree-bar label{font-size:11px;color:#8b949e}',
  '.tree-bar select{min-width:160px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6e6ef;padding:4px 8px;font:11px ui-monospace,Consolas,monospace}',
  '.tree-wrap{flex:1;min-height:0;overflow:auto;padding:12px 14px}',
  '.t-node{position:relative;margin:0 0 6px 0;padding:6px 10px 6px 12px;border-left:3px solid #30363d;border-radius:6px;background:#161b22;font-size:11px}',
  '.t-node.pending{border-left-color:#6e7681;color:#8b949e}',
  '.t-node.scheduled{border-left-color:#d29922}',
  '.t-node.running{border-left-color:#79c0ff}',
  '.t-node.ok{border-left-color:#7ee787}',
  '.t-node.error,.t-node.timeout{border-left-color:#ff7b72}',
  '.t-node.cancelled,.t-node.skipped{border-left-color:#484f58;color:#6e7681}',
  '.t-kids{margin:6px 0 0 14px;padding-left:10px;border-left:1px dashed #30363d}',
  '.t-fork{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 0 0;padding:8px 0 0 0}',
  '.t-fork>.t-node{flex:1;min-width:140px;margin:0}',
  '.t-seq>.t-node{margin-left:0}',
  '.t-meta{font-size:10px;color:#8b949e;margin-top:2px}',
].join('');

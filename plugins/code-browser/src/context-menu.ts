/** 选中代码块右键菜单 + 选区行号计算（嵌入 HTML） */
export const CONTEXT_MENU_CSS = [
  '.ctx-menu{position:fixed;z-index:100001;display:none;min-width:168px;padding:4px 0;',
  'background:#21262d;border:1px solid #30363d;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.45)}',
  '.ctx-menu.open{display:block}',
  '.ctx-menu button{display:block;width:100%;text-align:left;background:transparent;border:none;',
  'color:#e6e6ef;padding:8px 14px;font:12px system-ui,"Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer}',
  '.ctx-menu button:hover{background:rgba(56,139,253,.14);color:#79c0ff}',
  '.ctx-menu button:disabled{opacity:.4;cursor:default}',
].join('');

export const CONTEXT_MENU_HTML =
  '<div class="ctx-menu" id="ctx-menu"><button type="button" id="ctx-slice">局部编辑选中…</button></div>';

export const CONTEXT_MENU_JS = [
  'function closeCtxMenu(){var m=document.getElementById("ctx-menu");if(m)m.classList.remove("open");}',
  'function textOffsetIn(root,targetNode,targetOffset){var n=0,found=null;',
  'function walk(node){if(found!==null)return;if(node.nodeType===3){if(node===targetNode){found=n+targetOffset;return;}n+=node.length;',
  '}else{for(var i=0;i<node.childNodes.length;i++)walk(node.childNodes[i]);}}walk(root);return found;}',
  'function selectionLineRange(root,fullText){',
  'var sel=window.getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed)return null;',
  'var range=sel.getRangeAt(0);if(!root.contains(range.commonAncestorContainer))return null;',
  'var a=textOffsetIn(root,range.startContainer,range.startOffset);',
  'var b=textOffsetIn(root,range.endContainer,range.endOffset);',
  'if(a===null||b===null)return null;var lo=Math.min(a,b),hi=Math.max(a,b);',
  'var startLine=fullText.slice(0,lo).split("\\n").length;',
  'var endLine=fullText.slice(0,hi).split("\\n").length;return{startLine:startLine,endLine:endLine};}',
  'function bindSliceContextMenu(opts){',
  'var menu=document.getElementById("ctx-menu"),btn=document.getElementById("ctx-slice");',
  'if(!menu||!btn)return;',
  'document.addEventListener("click",closeCtxMenu);document.addEventListener("scroll",closeCtxMenu,true);',
  'opts.root.addEventListener("contextmenu",function(e){',
  'var range=selectionLineRange(opts.codeInner,opts.getText());',
  'btn.disabled=!range||!opts.getPath();',
  'if(!range||!opts.getPath()){e.preventDefault();return;}',
  'e.preventDefault();menu.style.left=Math.min(e.clientX,window.innerWidth-180)+"px";',
  'menu.style.top=Math.min(e.clientY,window.innerHeight-60)+"px";menu.classList.add("open");',
  'btn.onclick=function(){closeCtxMenu();if(!window.wh||!window.wh.openCodeEditor)return;',
  'window.wh.openCodeEditor({path:opts.getPath(),startLine:range.startLine,endLine:range.endLine});};});}',
].join('');

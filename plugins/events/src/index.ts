import type { Plugin, PluginContext, PluginEvent } from '@wizard-harness/core';
import type { EventsService, EventQuery } from '@wizard-harness/contracts';

/**
 * events 插件：把事件总线能力暴露为服务。
 * 其它插件/壳通过 services.get('events') 获得：发布、订阅、查历史。
 */
let ctx: PluginContext | undefined;

function matches(e: PluginEvent, q: EventQuery): boolean {
  if (q.actor && e.actor !== q.actor) return false;
  if (q.action && e.action !== q.action) return false;
  if (q.target && e.target !== q.target) return false;
  return true;
}

/** api 即服务：实现契约层 EventsService（core/src/services/events.ts） */
const api: EventsService = {
  /** 发布一条事件（actor 为 plugin:events） */
  publish(action: string, target?: string, payload?: unknown): void {
    ctx?.emit({ action, target, payload });
  },
  /** 订阅总线事件，返回取消订阅函数 */
  subscribe(listener: (event: PluginEvent) => void): () => void {
    return ctx?.events.subscribe(listener) ?? (() => {});
  },
  /** 查询最近事件历史（可选按 actor/action/target 过滤） */
  history(query: EventQuery = {}): PluginEvent[] {
    const events = ctx?.events.history() ?? [];
    let out = events.filter((e) => matches(e, query));
    if (query.limit && query.limit > 0) out = out.slice(-query.limit);
    return out;
  },
  /** 当前缓冲的事件条数 */
  count(): number {
    return ctx?.events.history().length ?? 0;
  },
  /** 清空内存历史（不发事件） */
  clear(): void {
    ctx?.events.clear();
  },
};

const eventsPlugin: Plugin = {
  manifest: {
    id: 'events',
    version: '0.1.0',
    name: '事件总线插件',
    description: '把事件总线能力暴露为服务：发布 / 订阅 / 查询历史 / 清空',
    provides: ['events'],
    config: { buffer: 500 },
    tier: 'core',
  },
  api,
  ui: {
    title: '事件总线',
    width: 640,
    height: 440,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:ui-monospace,Consolas,"Microsoft YaHei",monospace;background:#0d1117;color:#e6e6ef}',
      '::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#2c2c3a;border-radius:4px}',
      '.bar{padding:10px 14px;border-bottom:1px solid #262634;background:#16161e;display:flex;gap:8px;align-items:center}',
      '.bar h1{font-size:14px;margin:0;font-weight:600}',
      '.bar .cnt{font-size:11px;color:#79c0ff;margin-left:auto}',
      '.bar button{font:11px system-ui;cursor:pointer;background:transparent;border:1px solid #333;color:#a8a8bd;border-radius:8px;padding:3px 10px}',
      '#list{padding:8px 14px;font-size:12px;line-height:1.7}',
      '.ev{white-space:pre-wrap;word-break:break-all;padding:2px 0;border-bottom:1px dashed #1c1c28}',
      '.t{color:#a8a8bd}.a{color:#cfcfe0}.x{color:#ff7b72}.m{color:#79c0ff}',
      '</style></head><body>',
      '<div class="bar"><h1>事件总线</h1><span class="cnt" id="cnt">-</span><button id="clr">清空</button></div>',
      '<div id="list">加载中…</div>',
      '<script>',
      'var list=document.getElementById("list");var cnt=document.getElementById("cnt");',
      'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}',
      'async function refresh(){',
      'try{var r=await window.wh.eventsHistory();cnt.textContent=r.length+" 条";',
      'var rows=r.slice(-40).reverse().map(function(e){',
      'return "<div class=ev><span class=t>"+esc(new Date(e.ts).toISOString().slice(11,19))+"</span> <span class=a>"+esc(e.actor)+"</span> <span class=x>→</span> <span class=m>"+esc(e.action)+(e.target?" "+esc(e.target):"")+"</span></div>";',
      '}).join("");',
      'list.innerHTML=rows||"暂无事件";}catch(err){list.innerHTML="<span class=x>加载失败: "+esc(err)+"</span>";}}',
      'refresh();setInterval(refresh,1500);',
      'document.getElementById("clr").onclick=async function(){',
      'if(!window.wh||!window.wh.eventsClear)return;',
      'await window.wh.eventsClear();refresh();',
      '};',
      '</script></body></html>',
    ].join(''),
  },
  async register(c) {
    ctx = c;
  },
};

export default eventsPlugin;

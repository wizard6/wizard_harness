import type { Plugin } from '@wizard-harness/core';

/**
 * hello 插件：最小真实插件包。
 * 演示：manifest 声明（输入/输出/副作用）→ register 发观测事件 → 收敛对外 api → 轻量弹窗 ui。
 */
const helloPlugin: Plugin = {
  manifest: {
    id: 'hello',
    version: '0.1.0',
    name: 'Hello 插件',
    description: '最小真实插件示例（Cordis 风格 inject logger）',
    provides: ['hello', 'greeter'],
  },
  // Cordis：export const inject = ['logger']
  inject: ['logger'],
  register(ctx) {
    ctx.emit({ action: 'hello', target: 'world', payload: { from: 'plugin:hello' } });
    const logger = ctx.get<{ info?: (m: string) => string }>('logger');
    logger?.info?.('hello 插件已注入 logger');
  },
  onStart(ctx) {
    ctx.emit({ action: 'start', target: 'hello' });
  },
  onStop(ctx) {
    ctx.emit({ action: 'stop', target: 'hello' });
  },
  api: {
    greet(name = 'world'): string {
      return `hello, ${name}!`;
    },
  },
  ui: {
    title: 'Hello 插件',
    width: 420,
    height: 320,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;background:#16161e;color:#e6e6ef}',
      '::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#2c2c3a;border-radius:4px}',
      '.card{padding:22px}',
      '.head{display:flex;align-items:center;gap:10px}',
      '.logo{width:30px;height:30px;border-radius:9px;flex:none;background:linear-gradient(135deg,#7ee787,#79c0ff);display:inline-flex;align-items:center;justify-content:center;font-weight:800;color:#0d1117;box-shadow:0 2px 10px rgba(121,192,255,.35)}',
      'h1{font-size:16px;margin:0;font-weight:600}',
      '.ver{font-size:11px;color:#7ee787;border:1px solid #2c2c3a;padding:1px 8px;border-radius:10px;margin-left:auto}',
      '.desc{margin:8px 0 14px;font-size:13px;color:#a8a8bd;line-height:1.6}',
      '.badges{display:flex;gap:8px;margin-bottom:16px}',
      '.badge{font-size:11px;padding:3px 10px;border-radius:12px;border:1px solid #2c2c3e;color:#a8a8bd}',
      '.badge.on{color:#7ee787;background:rgba(126,231,135,.12);border-color:transparent}',
      '.api{border-top:1px solid #262634;padding-top:14px}',
      '.api button{background:linear-gradient(135deg,#2ea043,#238636);color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(46,160,67,.35)}',
      '.api button:hover{filter:brightness(1.1)}',
      '.out{margin:12px 0 0;font-size:13px;color:#79c0ff;font-family:ui-monospace,Consolas,monospace}',
      '</style></head><body><div class="card">',
      '<div class="head"><span class="logo">W</span><h1>Hello 插件</h1><span class="ver">v0.1.0</span></div>',
      '<p class="desc">最小真实插件示例：演示插件从声明、注册观测到对外接口的完整链路。</p>',
      '<div class="badges"><span class="badge on">● 运行中</span><span class="badge">id: hello</span></div>',
      '<div class="api"><button id="greet">打招呼</button><p id="out" class="out"></p></div>',
      '</div><script>',
      'var btn=document.getElementById("greet");var out=document.getElementById("out");',
      'btn.addEventListener("click",function(){out.textContent="hello, world! — 来自 hello 插件的 api.greet()";});',
      '</script></body></html>',
    ].join(''),
  },
};

export default helloPlugin;

import type { Plugin } from '@wizard-harness/core';
import type { AgentLoopService } from '@wizard-harness/contracts';
import { createAgentLoop } from './loop.js';

/**
 * agent-loop 插件：编排 llm.complete + tools.call，读写 agent 绑定的 session。
 * 说明文档：docs/plugins/agent-loop.html
 */
let impl: AgentLoopService | undefined;

function live(): AgentLoopService {
  if (!impl) throw new Error('agent-loop 未就绪');
  return impl;
}

const api: AgentLoopService = {
  run: (opts) => live().run(opts),
  cancel: (agentId) => live().cancel(agentId),
};

const agentLoopPlugin: Plugin = {
  manifest: {
    id: 'agent-loop',
    version: '0.1.0',
    name: 'Agent 循环',
    description: 'Observe → Think → Act 循环：组装上下文、模型推理、执行工具，直到无待办意图。',
    provides: ['agentLoop'],
    config: { maxSteps: 12, compactKeep: 0 },
    tier: 'standard',
  },
  inject: { agent: true, llm: true, tools: true, promptContext: false, logger: false, trajectory: false },
  api,
  ui: {
    title: 'Agent 循环',
    width: 480,
    height: 420,
    rpc: { agentLoop: ['run', 'cancel'] },
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#16161e;color:#e6e6ef}',
      '.card{padding:18px 22px} h1{font-size:16px;margin:0 0 6px}',
      '.desc{margin:0 0 12px;font-size:13px;color:#a8a8bd;line-height:1.6}',
      'textarea,button{font:12px/1.5 system-ui,"Microsoft YaHei",sans-serif}',
      'textarea{width:100%;box-sizing:border-box;background:#101018;color:#e6e6ef;border:1px solid #2c2c3e;border-radius:8px;padding:8px}',
      'button{margin-top:8px;background:rgba(126,231,135,.14);border:1px solid rgba(126,231,135,.35);color:#7ee787;border-radius:8px;padding:6px 12px;cursor:pointer}',
      'pre{white-space:pre-wrap;font-size:12px;color:#d7d7e4}',
      '</style></head><body><div class="card">',
      '<h1>Agent 循环</h1>',
      '<p class="desc">弹窗只能调 ui.rpc 声明的 agentLoop.run / cancel。</p>',
      '<textarea id="p" rows="3">echo hi</textarea>',
      '<button id="go">运行</button>',
      '<pre id="out"></pre>',
      '<script>',
      'document.getElementById("go").onclick=async()=>{',
      'const out=document.getElementById("out"); out.textContent="…" ;',
      'try{ const r=await window.wh.call("agentLoop","run",[{prompt:document.getElementById("p").value,maxSteps:4}]);',
      'out.textContent=r.ok?JSON.stringify(r.result,null,2):(r.error||"失败"); }catch(e){ out.textContent=String(e); }',
      '};',
      '</script>',
      '</div></body></html>',
    ].join(''),
  },
  register(c) {
    impl = createAgentLoop(c);
    c.logger?.info?.('agent-loop 插件就绪');
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default agentLoopPlugin;

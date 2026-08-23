import type { Plugin } from '@wizard-harness/core';
import type { PromptContextService } from '@wizard-harness/contracts';
import { createPromptContextRegistry } from './registry.js';

/**
 * prompt-context 插件：模型可见上下文组装（sections / contexts / tools / variables）。
 * 说明文档：docs/plugins/prompt-context.html
 */
let impl: PromptContextService | undefined;

function live(): PromptContextService {
  if (!impl) throw new Error('prompt-context 未就绪');
  return impl;
}

const api: PromptContextService = {
  section: (s) => live().section(s),
  context: (e) => live().context(e),
  variable: (n, p) => live().variable(n, p),
  tools: (p) => live().tools(p),
  bind: (o) => live().bind(o),
  assemble: (c) => live().assemble(c),
  apply: (id, a) => live().apply(id, a),
  setPersona: (id, c) => live().setPersona(id, c),
  getPersona: (id) => live().getPersona(id),
};

const promptContextPlugin: Plugin = {
  manifest: {
    id: 'prompt-context',
    version: '0.2.0',
    name: 'Prompt Context',
    description: '组装模型可见上下文：system sections、runtime contexts、tool schemas、variables。',
    provides: ['promptContext'],
    config: {},
    tier: 'standard',
  },
  inject: { session: true, logger: false, trajectory: false },
  api,
  ui: {
    title: 'Prompt Context',
    width: 520,
    height: 400,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#16161e;color:#e6e6ef}',
      '.card{padding:22px}',
      'h1{font-size:16px;margin:0 0 6px}',
      '.desc{margin:0 0 14px;font-size:13px;color:#a8a8bd;line-height:1.6}',
      '.row{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #262634}',
      '.k{color:#a8a8bd}.v{color:#79c0ff;font-family:ui-monospace,Consolas,monospace}',
      '.badge{display:inline-block;font-size:11px;padding:2px 10px;border-radius:12px;background:rgba(121,192,255,.12);color:#79c0ff;margin-bottom:12px}',
      '</style></head><body><div class="card">',
      '<span class="badge">● promptContext 服务</span>',
      '<h1>Prompt Context</h1>',
      '<p class="desc">ctx.promptContext.section / context / tools / variable / assemble / apply。sections→system；contexts→user 快照；tools→模型工具表。agent-loop 每步 assemble+apply。</p>',
      '<div class="row"><span class="k">服务名</span><span class="v">promptContext</span></div>',
      '<div class="row"><span class="k">依赖</span><span class="v">session</span></div>',
      '<div class="row"><span class="k">观测</span><span class="v">prompt-context/assemble · apply · persona</span></div>',
      '<div class="row"><span class="k">说明</span><span class="v">docs/plugins/prompt-context.html</span></div>',
      '</div></body></html>',
    ].join(''),
  },
  register(c) {
    impl = createPromptContextRegistry(c);
    c.logger?.info?.('prompt-context 插件就绪');
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default promptContextPlugin;

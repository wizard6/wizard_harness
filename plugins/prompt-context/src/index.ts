import type { Plugin } from '@wizard-harness/core';
import type { PromptContextService } from '@wizard-harness/contracts';
import { createPromptContextRegistry } from './registry.js';
import { PROMPT_CONTEXT_HTML } from './page.js';

/**
 * prompt-context 插件：模型可见上下文组装（sections / contexts / tools / variables）。
 * 本仓库没有 system-prompt 插件；不要再造一个。
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
  inspect: () => live().inspect(),
  usage: (input) => live().usage(input),
};

const promptContextPlugin: Plugin = {
  manifest: {
    id: 'prompt-context',
    version: '0.2.0',
    name: 'Prompt Context',
    description: '组装模型可见上下文；窗口可看登记素材与最近一次拼接成品。',
    provides: ['promptContext'],
    config: {},
    tier: 'standard',
  },
  inject: { session: true, logger: false, trajectory: false },
  api,
  ui: {
    title: 'Prompt Context',
    width: 860,
    height: 640,
    rpc: { promptContext: ['inspect', 'assemble', 'usage'] },
    content: PROMPT_CONTEXT_HTML,
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

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { PERSONA_SERVICE } from '@wizard-harness/contracts';
import type {
  AgentService,
  PersonaRememberInput,
  PersonaSavePatch,
  PersonaService,
  PromptContextService,
  ToolsService,
} from '@wizard-harness/contracts';
import { createPersonaHost } from './host.js';
import { PERSONA_HTML } from './page.js';

/**
 * persona：当前助手的人格 / 习惯 / 记忆。经 prompt-context 出门，不替代组装器。
 * 说明文档：docs/plugins/persona.html
 */
let impl: PersonaService | undefined;

function live(): PersonaService {
  if (!impl) throw new Error('persona 未就绪');
  return impl;
}

const api: PersonaService = {
  snapshot: () => live().snapshot(),
  save: (patch: PersonaSavePatch) => live().save(patch),
  addMemory: (input) => live().addMemory(input),
  removeMemory: (id) => live().removeMemory(id),
  pinMemory: (id, pinned) => live().pinMemory(id, pinned),
  remember: (input: PersonaRememberInput) => live().remember(input),
};

function persistFileOf(c: PluginContext): string | undefined {
  const fromCfg = String(c.config.persistFile ?? '').trim();
  if (fromCfg) return fromCfg;
  if (process.env.VITEST || process.env.VITEST_WORKER_ID) return undefined;
  return join(process.env.WH_HOME || join(homedir(), '.wizard-harness'), 'persona.json');
}

function wirePrompt(ctx: PluginContext, host: ReturnType<typeof createPersonaHost>) {
  const prompts = ctx.promptContext ?? ctx.get<PromptContextService>('promptContext');
  if (!prompts) throw new Error('persona 需要 prompt-context');
  prompts.section({
    name: 'persona:core',
    order: 2,
    text: () => host.renderCore(),
  });
  prompts.context({
    name: 'persona:memory',
    order: 8,
    text: () => host.renderMemory(),
  });
}

function wireTools(ctx: PluginContext) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) return;
  tools.register({
    name: 'persona_remember',
    description:
      '把一条事实写入当前人格档案。args.text 必填；可选 args.kind=memory|habit（默认 memory）、args.pinned=true 钉住（每轮都会带上）。习惯会进系统段，记忆进相关记忆（未钉只保留最近几条）。',
    handler: (args) =>
      live().remember({
        text: String(args.text ?? ''),
        pinned: args.pinned === true || args.pinned === 'true',
        kind: String(args.kind ?? 'memory') === 'habit' ? 'habit' : 'memory',
      }).profile,
  });
}

const personaPlugin: Plugin = {
  manifest: {
    id: 'persona',
    version: '0.1.0',
    name: '人格',
    description: '管理当前助手的人格、习惯与相关记忆；经 prompt-context 拼进模型可见上下文。',
    provides: [PERSONA_SERVICE],
    config: { persistFile: '' },
    tier: 'standard',
  },
  inject: { promptContext: true, logger: false, tools: false, agent: false },
  api,
  ui: {
    title: '人格',
    width: 720,
    height: 620,
    rpc: {
      persona: ['snapshot', 'save', 'addMemory', 'removeMemory', 'pinMemory'],
    },
    content: PERSONA_HTML,
  },
  register(c) {
    const host = createPersonaHost({
      persistFile: persistFileOf(c),
      agents: () => c.agent ?? c.get<AgentService>('agent'),
      emit: (action, target, payload) => c.emit({ action, target, payload }),
    });
    impl = host;
    wirePrompt(c, host);
    c.logger?.info?.('persona 插件就绪');
    c.effect(() => () => {
      impl = undefined;
    });
  },
  onStart(c) {
    // boot 两阶段：此时 tools 已挂上，即使本插件排在 tools 前面也能登记 persona_remember
    wireTools(c);
  },
};

export default personaPlugin;

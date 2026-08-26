import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { PERSONA_SERVICE } from '@wizard-harness/contracts';
import type {
  AgentService,
  PersonaApplyInput,
  PersonaConfigurePatch,
  PersonaRememberInput,
  PersonaSavePatch,
  PersonaService,
  PromptContextService,
  ToolsService,
} from '@wizard-harness/contracts';
import { PERSONA_AUTHORING_HINT } from './guide.js';
import { createPersonaHost } from './host.js';
import { PERSONA_HTML } from './page.js';

/**
 * persona（硅灵）：当前助手的 AI格 / 习惯 / 记忆。经 prompt-context 出门，不替代组装器。
 * 说明文档：docs/plugins/persona.html
 */
let impl: ReturnType<typeof createPersonaHost> | undefined;

function live(): ReturnType<typeof createPersonaHost> {
  if (!impl) throw new Error('persona 未就绪');
  return impl;
}

const api: PersonaService = {
  snapshot: () => live().snapshot(),
  read: () => live().read(),
  guide: () => live().guide(),
  save: (patch: PersonaSavePatch) => live().save(patch),
  configure: (patch: PersonaConfigurePatch) => live().configure(patch),
  apply: (input: PersonaApplyInput) => live().apply(input),
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
  prompts.section({
    name: 'persona:authoring-hint',
    order: 3,
    text: () => (host.isDefault() ? PERSONA_AUTHORING_HINT : ''),
  });
  prompts.context({
    name: 'persona:memory',
    order: 8,
    text: () => host.renderMemory(),
  });
}

function asTraits(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return raw.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  return undefined;
}

function wireTools(ctx: PluginContext) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) return;

  tools.register({
    name: 'persona_read',
    description:
      '读取当前硅灵（AI格）档案：profile、组装预览、落盘路径、是否仍为默认人设。无参数。定制硅灵前先调用。',
    handler: () => live().read(),
  });

  tools.register({
    name: 'persona_guide',
    description:
      '获取自生成硅灵的字段说明、写作模板与检查清单。无参数。配合 persona_apply 使用。',
    handler: () => live().guide(),
  });

  tools.register({
    name: 'persona_apply',
    description:
      '一次性写入自生成硅灵（AI格）并落盘。args.name、args.personality 必填；建议同时提供 role、voice_style、traits。可选 tone、boundaries、tagline、habits、replace_habits。',
    handler: (args) =>
      live().apply({
        name: String(args.name ?? ''),
        personality: String(args.personality ?? ''),
        role: args.role != null ? String(args.role) : undefined,
        voiceStyle: args.voice_style != null ? String(args.voice_style) : args.voiceStyle != null ? String(args.voiceStyle) : undefined,
        tone: args.tone != null ? String(args.tone) : undefined,
        traits: asTraits(args.traits),
        boundaries: args.boundaries != null ? String(args.boundaries) : undefined,
        tagline: args.tagline != null ? String(args.tagline) : undefined,
        habits: Array.isArray(args.habits) ? args.habits.map(String) : undefined,
        replaceHabits: args.replace_habits === true || args.replace_habits === 'true',
      }).profile,
  });

  tools.register({
    name: 'persona_configure',
    description:
      '局部修改硅灵档案并落盘。可传 name、personality、habits、role、voice_style、tone、traits、boundaries、tagline（均为可选，只改传入字段）。',
    handler: (args) => {
      const patch: PersonaConfigurePatch = {};
      if (args.name != null) patch.name = String(args.name);
      if (args.personality != null) patch.personality = String(args.personality);
      if (Array.isArray(args.habits)) patch.habits = args.habits.map(String);
      const meta: {
        role?: string;
        voiceStyle?: string;
        tone?: string;
        traits?: string[];
        boundaries?: string;
        tagline?: string;
      } = {};
      if (args.role != null) meta.role = String(args.role);
      if (args.voice_style != null) meta.voiceStyle = String(args.voice_style);
      else if (args.voiceStyle != null) meta.voiceStyle = String(args.voiceStyle);
      if (args.tone != null) meta.tone = String(args.tone);
      if (args.traits != null) meta.traits = asTraits(args.traits);
      if (args.boundaries != null) meta.boundaries = String(args.boundaries);
      if (args.tagline != null) meta.tagline = String(args.tagline);
      if (Object.keys(meta).length) patch.meta = meta;
      return live().configure(patch).profile;
    },
  });

  tools.register({
    name: 'persona_remember',
    description:
      '把一条事实写入当前硅灵档案。args.text 必填；可选 args.kind=memory|habit（默认 memory）、args.pinned=true 钉住（每轮都会带上）。习惯会进系统段，记忆进相关记忆（未钉只保留最近几条）。',
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
    version: '0.2.1',
    name: '硅灵',
    description:
      '管理助手硅灵（AI格）：元数据、硅格正文、习惯与相关记忆；提供 persona_apply/configure 等自生成工具；经 prompt-context 拼进模型可见上下文。',
    provides: [PERSONA_SERVICE],
    config: { persistFile: '' },
    tier: 'standard',
  },
  inject: { promptContext: true, logger: false, tools: false, agent: false },
  api,
  ui: {
    title: '硅灵',
    width: 860,
    height: 720,
    rpc: {
      persona: [
        'snapshot',
        'read',
        'save',
        'configure',
        'addMemory',
        'removeMemory',
        'pinMemory',
      ],
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
    c.logger?.info?.('硅灵（persona）插件就绪 v0.2.1');
    c.effect(() => () => {
      impl = undefined;
    });
  },
  onStart(c) {
    wireTools(c);
  },
};

export default personaPlugin;

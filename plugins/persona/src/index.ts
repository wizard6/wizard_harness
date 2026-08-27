import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { PERSONA_SERVICE, PERSONA_SOUL_LIMIT } from '@wizard-harness/contracts';
import type {
  PersonaCreateInput,
  PersonaService,
  PersonaUpdateInput,
  PromptContextService,
  ToolsService,
} from '@wizard-harness/contracts';
import { PERSONA_AUTHORING_HINT } from './guide.js';
import { createPersonaHost } from './host.js';
import { PERSONA_HTML } from './page.js';

/**
 * persona（硅灵）：soul.md 式身份基线。多份可切换；不管理记忆。
 * 若装有 prompt-context 则登记 persona:core；tools 可选。
 * 说明文档：docs/plugins/persona.html
 */
let impl: ReturnType<typeof createPersonaHost> | undefined;

function live(): ReturnType<typeof createPersonaHost> {
  if (!impl) throw new Error('persona 未就绪');
  return impl;
}

const api: PersonaService = {
  snapshot: () => live().snapshot(),
  list: () => live().list(),
  read: (id) => live().read(id),
  guide: () => live().guide(),
  create: (input) => live().create(input),
  update: (input) => live().update(input),
  activate: (id) => live().activate(id),
  remove: (id) => live().remove(id),
  save: (patch) => live().save(patch),
  soul: () => live().soul(),
};

function persistFileOf(c: PluginContext): string | undefined {
  const fromCfg = String(c.config.persistFile ?? '').trim();
  if (fromCfg) return fromCfg;
  if (process.env.VITEST || process.env.VITEST_WORKER_ID) return undefined;
  return join(process.env.WH_HOME || join(homedir(), '.wizard-harness'), 'persona.json');
}

function wirePrompt(ctx: PluginContext, host: ReturnType<typeof createPersonaHost>) {
  const prompts = ctx.promptContext ?? ctx.get<PromptContextService>('promptContext');
  if (!prompts) return;
  prompts.section({
    name: 'persona:core',
    order: 2,
    text: () => host.soul(),
  });
  prompts.section({
    name: 'persona:authoring-hint',
    order: 3,
    text: () => (host.isDefault() ? PERSONA_AUTHORING_HINT : ''),
  });
}

function asTraits(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return raw.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  return undefined;
}

function asHabits(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

function createInputOf(args: Record<string, unknown>): PersonaCreateInput {
  return {
    name: String(args.name ?? ''),
    soul: args.soul != null ? String(args.soul) : undefined,
    personality: args.personality != null ? String(args.personality) : undefined,
    role: args.role != null ? String(args.role) : undefined,
    voiceStyle:
      args.voice_style != null
        ? String(args.voice_style)
        : args.voiceStyle != null
          ? String(args.voiceStyle)
          : undefined,
    tone: args.tone != null ? String(args.tone) : undefined,
    traits: asTraits(args.traits),
    boundaries: args.boundaries != null ? String(args.boundaries) : undefined,
    tagline: args.tagline != null ? String(args.tagline) : undefined,
    habits: asHabits(args.habits),
    activate: args.activate === false || args.activate === 'false' ? false : true,
  };
}

function updateInputOf(args: Record<string, unknown>): PersonaUpdateInput {
  const patch: PersonaUpdateInput = {};
  if (args.id != null) patch.id = String(args.id);
  if (args.name != null) patch.name = String(args.name);
  if (args.soul != null) patch.soul = String(args.soul);
  if (args.personality != null) patch.personality = String(args.personality);
  if (args.role != null) patch.role = String(args.role);
  if (args.voice_style != null) patch.voiceStyle = String(args.voice_style);
  else if (args.voiceStyle != null) patch.voiceStyle = String(args.voiceStyle);
  if (args.tone != null) patch.tone = String(args.tone);
  if (args.traits != null) patch.traits = asTraits(args.traits);
  if (args.boundaries != null) patch.boundaries = String(args.boundaries);
  if (args.tagline != null) patch.tagline = String(args.tagline);
  if (args.habits != null) patch.habits = asHabits(args.habits);
  return patch;
}

function wireTools(ctx: PluginContext) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) return;

  tools.register({
    name: 'persona_list',
    description: '列出全部硅灵（id、名称、字数、是否当前份）。切换前先看这个。无参数。',
    handler: () => live().list(),
  });

  tools.register({
    name: 'persona_read',
    description:
      '读取硅灵身份基线。可选 args.id；缺省为当前份。返回 name、soul、字数、上限 3000。不包含记忆。',
    handler: (args) => live().read(args.id != null ? String(args.id) : undefined),
  });

  tools.register({
    name: 'persona_guide',
    description: '获取硅灵写作模板与检查清单。无参数。配合 persona_create / persona_update。',
    handler: () => live().guide(),
  });

  tools.register({
    name: 'persona_create',
    description:
      `新建一份硅灵并落盘。args.name 必填；args.soul 为 markdown 身份基线（≤${PERSONA_SOUL_LIMIT} 字）。也可用 personality/role/voice_style/habits 拼 soul。默认切为当前份；args.activate=false 只创建不切换。`,
    handler: (args) => live().create(createInputOf(args)).profile,
  });

  tools.register({
    name: 'persona_update',
    description:
      `更新硅灵。可选 args.id（缺省当前份）；可传 name、soul，或 personality 等字段重拼 soul。soul ≤${PERSONA_SOUL_LIMIT} 字。`,
    handler: (args) => live().update(updateInputOf(args)).profile,
  });

  tools.register({
    name: 'persona_switch',
    description: '切换当前硅灵。args.id 必填。之后模型上下文使用该份 soul。',
    handler: (args) => {
      const id = String(args.id ?? '').trim();
      if (!id) throw new Error('persona_switch 需要 args.id');
      return live().activate(id).profile;
    },
  });
}

const personaPlugin: Plugin = {
  manifest: {
    id: 'persona',
    version: '0.3.0',
    name: '硅灵',
    description:
      'soul.md 式身份基线：多份硅灵切换；不管理记忆。AI 可用 persona_create / persona_update / persona_switch。',
    provides: [PERSONA_SERVICE],
    config: { persistFile: '' },
    tier: 'standard',
  },
  inject: { promptContext: false, logger: false, tools: false },
  api,
  ui: {
    title: '硅灵',
    width: 920,
    height: 740,
    rpc: {
      persona: ['snapshot', 'list', 'read', 'save', 'create', 'update', 'activate', 'remove'],
    },
    content: PERSONA_HTML,
  },
  register(c) {
    const host = createPersonaHost({
      persistFile: persistFileOf(c),
      emit: (action, target, payload) => c.emit({ action, target, payload }),
    });
    impl = host;
    c.logger?.info?.('硅灵（persona）插件就绪 v0.3.0');
    c.effect(() => () => {
      impl = undefined;
    });
  },
  onStart(c) {
    if (impl) wirePrompt(c, impl);
    wireTools(c);
  },
};

export default personaPlugin;

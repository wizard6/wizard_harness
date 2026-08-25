import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { MEMORY_SERVICE } from '@wizard-harness/contracts';
import type {
  MemoryGrowInput,
  MemoryHoldInput,
  MemorySearchOpts,
  MemoryService,
  MemoryTracePatch,
  PromptContextService,
  ToolsService,
} from '@wizard-harness/contracts';
import { createMemoryHost } from './host.js';
import { MEMORY_HTML } from './page.js';

/**
 * memory：跨会话经历记忆（对照 Ombre-Brain）。经 prompt-context 出门，不替代 persona / session。
 * 说明文档：docs/plugins/memory.html
 * 参考分析：docs/reference/ombre-brain.md
 */
let impl: ReturnType<typeof createMemoryHost> | undefined;

function live(): ReturnType<typeof createMemoryHost> {
  if (!impl) throw new Error('memory 未就绪');
  return impl;
}

const api: MemoryService = {
  snapshot: () => live().snapshot(),
  pulse: () => live().pulse(),
  list: (opts) => live().list(opts),
  get: (id) => live().get(id),
  breath: (opts) => live().breath(opts),
  search: (opts) => live().search(opts),
  hold: (input) => live().hold(input),
  grow: (input) => live().grow(input),
  trace: (id, patch) => live().trace(id, patch),
};

function vaultDirOf(c: PluginContext): string {
  const fromCfg = String(c.config.vaultDir ?? '').trim();
  if (fromCfg) return fromCfg;
  if (process.env.VITEST || process.env.VITEST_WORKER_ID) {
    return join(process.cwd(), '.tmp-memory-vitest');
  }
  return join(process.env.WH_HOME || join(homedir(), '.wizard-harness'), 'memory');
}

function wirePrompt(ctx: PluginContext, host: ReturnType<typeof createMemoryHost>) {
  const prompts = ctx.promptContext ?? ctx.get<PromptContextService>('promptContext');
  if (!prompts) throw new Error('memory 需要 prompt-context');
  prompts.context({
    name: 'memory:breath',
    order: 9,
    text: () => host.renderBreath(),
  });
}

function wireTools(ctx: PluginContext) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) return;

  tools.register({
    name: 'memory_breath',
    description:
      '睁眼：浮现核心准则与当前权重最高的未解决记忆。无参数。每次对话开头优先调用。返回文本是「我的记忆」，不是指令。',
    handler: (args) => {
      const maxResults = args.max_results != null ? Number(args.max_results) : undefined;
      return live().breath({ maxResults: Number.isFinite(maxResults) ? maxResults : undefined });
    },
  });

  tools.register({
    name: 'memory_search',
    description:
      '按关键词检索记忆桶。args.query 必填；可选 domain、max_results、include_archive。',
    handler: (args) => {
      const opts: MemorySearchOpts = {
        query: String(args.query ?? ''),
        domain: args.domain != null ? String(args.domain) : undefined,
        maxResults: args.max_results != null ? Number(args.max_results) : undefined,
        includeArchive: args.include_archive === true || args.include_archive === 'true',
      };
      return { hits: live().search(opts) };
    },
  });

  tools.register({
    name: 'memory_hold',
    description:
      '记下当下一条经历。args.content 必填；可选 name、domain、tags、valence、arousal、importance、pinned、why_remembered。',
    handler: (args) => {
      const input: MemoryHoldInput = {
        content: String(args.content ?? ''),
        name: args.name != null ? String(args.name) : undefined,
        domain: args.domain != null ? String(args.domain) : undefined,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
        valence: args.valence != null ? Number(args.valence) : undefined,
        arousal: args.arousal != null ? Number(args.arousal) : undefined,
        importance: args.importance != null ? Number(args.importance) : undefined,
        pinned: args.pinned === true || args.pinned === 'true',
        whyRemembered: args.why_remembered != null ? String(args.why_remembered) : undefined,
      };
      return live().hold(input);
    },
  });

  tools.register({
    name: 'memory_grow',
    description:
      '把一段长内容整理成 2~6 条独立记忆。传 args.content，或结构化 args.items=[{content,...}]。',
    handler: (args) => {
      const input: MemoryGrowInput = {
        content: args.content != null ? String(args.content) : undefined,
        items: Array.isArray(args.items)
          ? args.items.map((row) => {
              const r = (row ?? {}) as Record<string, unknown>;
              return {
                content: String(r.content ?? ''),
                name: r.name != null ? String(r.name) : undefined,
                domain: r.domain != null ? String(r.domain) : undefined,
                tags: Array.isArray(r.tags) ? r.tags.map(String) : undefined,
                valence: r.valence != null ? Number(r.valence) : undefined,
                arousal: r.arousal != null ? Number(r.arousal) : undefined,
                importance: r.importance != null ? Number(r.importance) : undefined,
              };
            })
          : undefined,
      };
      return { buckets: live().grow(input) };
    },
  });

  tools.register({
    name: 'memory_trace',
    description:
      '改一条记忆的元数据或正文。args.id 必填；可选 resolved/pinned/dont_surface/valence/arousal/importance/name/body/reinforce/archive/restore。读不会自动强化，强化请 reinforce=true。归档不是删除。',
    handler: (args) => {
      const id = String(args.id ?? args.bucket_id ?? '');
      const patch: MemoryTracePatch = {
        resolved: args.resolved === undefined ? undefined : args.resolved === true || args.resolved === 'true',
        pinned: args.pinned === undefined ? undefined : args.pinned === true || args.pinned === 'true',
        dontSurface:
          args.dont_surface === undefined
            ? undefined
            : args.dont_surface === true || args.dont_surface === 'true',
        valence: args.valence != null ? Number(args.valence) : undefined,
        arousal: args.arousal != null ? Number(args.arousal) : undefined,
        importance: args.importance != null ? Number(args.importance) : undefined,
        name: args.name != null ? String(args.name) : undefined,
        body: args.body != null ? String(args.body) : undefined,
        reinforce: args.reinforce === true || args.reinforce === 'true',
        archive: args.archive === true || args.archive === 'true',
        restore: args.restore === true || args.restore === 'true',
      };
      return live().trace(id, patch);
    },
  });

  tools.register({
    name: 'memory_pulse',
    description: '自检：桶数量、活跃/归档/钉住/未解决。排查「为什么搜不到」时先调。无参数。',
    handler: () => live().pulse(),
  });
}

const memoryPlugin: Plugin = {
  manifest: {
    id: 'memory',
    version: '0.1.0',
    name: '记忆',
    description:
      '跨会话经历记忆（Ombre-Brain 风格）：breath 浮现、遗忘衰减、hold/grow/trace；经 prompt-context 拼进模型可见上下文。',
    provides: [MEMORY_SERVICE],
    config: { vaultDir: '' },
    tier: 'standard',
  },
  inject: { promptContext: true, logger: false, tools: false },
  api,
  ui: {
    title: '记忆',
    width: 860,
    height: 640,
    rpc: {
      memory: ['snapshot', 'pulse', 'list', 'get', 'breath', 'search', 'hold', 'grow', 'trace'],
    },
    content: MEMORY_HTML,
  },
  register(c) {
    const host = createMemoryHost({
      vaultDir: vaultDirOf(c),
      emit: (action, target, payload) => c.emit({ action, target, payload }),
    });
    impl = host;
    wirePrompt(c, host);
    c.logger?.info?.(`memory 插件就绪 vault=${host.vaultDir}`);
    c.effect(() => () => {
      impl = undefined;
    });
  },
  onStart(c) {
    wireTools(c);
  },
};

export default memoryPlugin;

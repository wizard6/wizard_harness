import type { Plugin, PluginContext } from '@wizard-harness/core';
import { PLUGIN_TAG_TOOLKIT } from '@wizard-harness/core';
import { KREA_SERVICE } from '@wizard-harness/contracts';
import type { KreaService, PromptContextService, ToolsService } from '@wizard-harness/contracts';
import { createKreaHost } from './host.js';
import { DEFAULT_KREA_MODEL } from './models.js';
import { KREA_HTML } from './page.js';

/**
 * krea：经官方 REST API 给 Agent 出图。Key 稍后由用户配置。
 * 说明文档：docs/plugins/krea.html
 */
let impl: KreaService | undefined;

function live(): KreaService {
  if (!impl) throw new Error('krea 未就绪');
  return impl;
}

const api: KreaService = {
  info: () => live().info(),
  models: () => live().models(),
  generate: (input) => live().generate(input),
  job: (jobId) => live().job(jobId),
};

function wireTools(ctx: PluginContext, host: ReturnType<typeof createKreaHost>) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) throw new Error('krea 需要 tools');
  tools.register({
    name: 'krea_models',
    description: '列出可用来出图的 Krea 模型（别名与路径）。画图前若不确定模型，先调这个。',
    handler: () => ({ defaultModel: host.defaultModel, models: host.models() }),
  });
  tools.register({
    name: 'krea_generate',
    description:
      '用 Krea 文生图（可图生图）。args.prompt 必填；可选 model（默认 krea-2-medium）、aspect_ratio（默认 1:1）、resolution（默认 1K）、wait（默认 true，等到出图）、seed、creativity、image_url、strength。返回 job_id / status / urls。',
    handler: (args) => host.generate(args),
  });
  tools.register({
    name: 'krea_job',
    description: '查询 Krea 任务。args.job_id 必填。生成未完成或超时后用这个继续拿 urls。',
    handler: (args) => host.job(args),
  });
}

const kreaPlugin: Plugin = {
  manifest: {
    id: 'krea',
    version: '0.1.0',
    name: 'Krea 绘图',
    description: '向 tools 登记 krea_models / krea_generate / krea_job，经 Krea API 出图。',
    provides: [KREA_SERVICE],
    config: {
      apiKey: '',
      defaultModel: DEFAULT_KREA_MODEL,
      wait: true,
      pollMs: 2000,
      timeoutMs: 180_000,
    },
    tier: 'standard',
    tags: [PLUGIN_TAG_TOOLKIT],
  },
  inject: { tools: true, logger: false, promptContext: false },
  api,
  ui: {
    title: 'Krea 绘图',
    width: 480,
    height: 420,
    rpc: { krea: ['info'] },
    content: KREA_HTML,
  },
  register(c) {
    const ac = new AbortController();
    const host = createKreaHost({
      apiKey: String(c.config.apiKey ?? process.env.WH_KREA_API_KEY ?? '').trim(),
      defaultModel: String(c.config.defaultModel ?? DEFAULT_KREA_MODEL).trim() || DEFAULT_KREA_MODEL,
      wait: c.config.wait !== false,
      pollMs: Number(c.config.pollMs ?? 2000),
      timeoutMs: Number(c.config.timeoutMs ?? 180_000),
      signal: ac.signal,
    });
    impl = {
      info: () => host.info(),
      models: () => host.models(),
      generate: (input) => host.generate({ ...input }),
      job: (jobId) => host.job({ job_id: jobId }),
    };
    wireTools(c, host);
    const prompts = c.promptContext ?? c.get<PromptContextService>('promptContext');
    if (prompts) {
      prompts.section({
        name: 'tool:krea',
        order: 86,
        text:
          '绘图：用 krea_generate（prompt 必填，默认模型 krea-2-medium）。' +
          (host.configured
            ? '已配置 Krea Key。'
            : '尚未配置 WH_KREA_API_KEY；没有 Key 时不要反复重试。') +
          '先出图再把 urls 给用户。未完成用 krea_job。可选模型见 krea_models。',
      });
    }
    c.logger?.info?.(`krea 插件就绪（${host.configured ? '已配置 Key' : '未配置 Key'}，model=${host.defaultModel}）`);
    c.effect(() => () => {
      ac.abort();
      impl = undefined;
    });
  },
};

export default kreaPlugin;

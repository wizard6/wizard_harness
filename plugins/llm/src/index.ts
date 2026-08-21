import type { Plugin, PluginContext } from '@wizard-harness/core';
import type { LlmMessage, LlmService, SessionService } from '@wizard-harness/contracts';
import { runModel } from './adapter.js';

/**
 * llm 插件：一个模型适配器，读写都落到 session。
 * 说明文档：docs/plugins/llm.html
 */
let ctx: PluginContext | undefined;

function sessionOf(): SessionService {
  const s = ctx?.session ?? ctx?.get<SessionService>('session');
  if (!s) throw new Error('llm 需要 session 服务');
  return s;
}

function asMessages(entries: readonly { data: Record<string, unknown> }[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const e of entries) {
    const role = e.data.role;
    const content = e.data.content;
    if ((role === 'system' || role === 'user' || role === 'assistant') && typeof content === 'string') {
      out.push({ role, content });
    }
  }
  return out;
}

const api: LlmService = {
  async complete(input = {}) {
    const sessions = sessionOf();
    const sess = input.sessionId
      ? sessions.get(input.sessionId)
      : (sessions.current() ?? sessions.start({ title: 'llm' }));
    if (!sess) throw new Error(`session 不存在：${input.sessionId}`);
    if (input.prompt) sess.append('message', { role: 'user', content: input.prompt });

    const cfg = {
      provider: String(ctx?.config.provider ?? 'mock'),
      baseUrl: String(ctx?.config.baseUrl ?? ''),
      apiKey: String(ctx?.config.apiKey ?? ''),
      model: String(ctx?.config.model ?? 'gpt-4o-mini'),
    };
    const messages = asMessages(sessions.deriveMessages(sess.id));
    ctx?.emit({ action: 'llm/request', target: sess.id, payload: { provider: cfg.provider, n: messages.length } });
    sess.append('turn', { phase: 'start' });
    try {
      const { text, provider } = await runModel(messages, cfg);
      sess.append('message', { role: 'assistant', content: text });
      ctx?.emit({ action: 'llm/result', target: sess.id, payload: { provider, bytes: text.length } });
      return { sessionId: sess.id, text, provider };
    } finally {
      sess.append('turn', { phase: 'end' });
    }
  },
};

const llmPlugin: Plugin = {
  manifest: {
    id: 'llm',
    version: '0.1.0',
    name: '模型适配器',
    description: '一次 complete：从 session 投影历史，把回复 append 回去。默认 mock。',
    provides: ['llm'],
    config: { provider: 'mock', baseUrl: '', apiKey: '', model: 'gpt-4o-mini' },
    tier: 'standard',
  },
  inject: { session: true, logger: false },
  api,
  ui: {
    title: '模型适配器',
    width: 480,
    height: 360,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#16161e;color:#e6e6ef}',
      '.card{padding:22px}',
      'h1{font-size:16px;margin:0 0 6px}',
      '.desc{margin:0 0 14px;font-size:13px;color:#a8a8bd;line-height:1.6}',
      '.row{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #262634}',
      '.k{color:#a8a8bd}.v{color:#79c0ff;font-family:ui-monospace,Consolas,monospace}',
      '.badge{display:inline-block;font-size:11px;padding:2px 10px;border-radius:12px;background:rgba(210,168,255,.12);color:#d2a8ff;margin-bottom:12px}',
      '</style></head><body><div class="card">',
      '<span class="badge">● llm 服务</span>',
      '<h1>模型适配器</h1>',
      '<p class="desc">ctx.llm.complete 读写 session，不另存聊天记录。默认 mock；config.provider=openai 且填 baseUrl 才走 HTTP。</p>',
      '<div class="row"><span class="k">服务名</span><span class="v">llm</span></div>',
      '<div class="row"><span class="k">依赖</span><span class="v">session（必选）</span></div>',
      '<div class="row"><span class="k">观测</span><span class="v">llm/request · llm/result</span></div>',
      '<div class="row"><span class="k">说明</span><span class="v">docs/plugins/llm.html</span></div>',
      '</div></body></html>',
    ].join(''),
  },
  register(c) {
    ctx = c;
    c.logger?.info?.(`llm 插件就绪（provider=${String(c.config.provider ?? 'mock')}）`);
    c.effect(() => () => {
      ctx = undefined;
    });
  },
};

export default llmPlugin;

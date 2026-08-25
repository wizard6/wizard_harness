import type { Plugin, PluginContext } from '@wizard-harness/core';
import type { LlmMessage, LlmService, SessionService, TrajectoryService } from '@wizard-harness/contracts';
import { runModel, toWireMessages, buildToolWireMaps } from './adapter.js';

/**
 * llm 插件：一个模型适配器，读写都落到 session。
 * 说明文档：docs/plugins/llm.html
 */
let ctx: PluginContext | undefined;

function trajOf(): TrajectoryService | undefined {
  return ctx?.trajectory ?? ctx?.get<TrajectoryService>('trajectory');
}

function sessionOf(): SessionService {
  const s = ctx?.session ?? ctx?.get<SessionService>('session');
  if (!s) throw new Error('llm 需要 session 服务');
  return s;
}

function cfgOf() {
  const c = ctx?.config ?? {};
  return {
    provider: String(process.env.WH_LLM_PROVIDER || c.provider || 'mock'),
    baseUrl: String(process.env.WH_LLM_BASE_URL || c.baseUrl || ''),
    apiKey: String(process.env.WH_LLM_API_KEY || c.apiKey || ''),
    model: String(process.env.WH_LLM_MODEL || c.model || 'gpt-4o-mini'),
  };
}

function asMessages(entries: readonly { kind: string; data: Record<string, unknown> }[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const e of entries) {
    if (e.kind === 'message') {
      const role = e.data.role;
      const content = typeof e.data.content === 'string' ? e.data.content : '';
      if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') {
        const msg: LlmMessage = { role, content };
        if (typeof e.data.tool_call_id === 'string') msg.tool_call_id = e.data.tool_call_id;
        if (typeof e.data.name === 'string') msg.name = e.data.name;
        if (Array.isArray(e.data.tool_calls)) msg.tool_calls = e.data.tool_calls as LlmMessage['tool_calls'];
        out.push(msg);
      }
    } else if (e.kind === 'tool-result') {
      const name = typeof e.data.name === 'string' ? e.data.name : 'tool';
      const content = typeof e.data.content === 'string' ? e.data.content : '';
      const callId = typeof e.data.callId === 'string' ? e.data.callId : '';
      out.push({ role: 'tool', content, name, tool_call_id: callId || undefined });
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

    const cfg = cfgOf();
    const messages = asMessages(sess.replay());
    const { realToWire } = buildToolWireMaps(input.tools);
    const wire = toWireMessages(messages, realToWire);
    ctx?.emit({ action: 'llm/request', target: sess.id, payload: { provider: cfg.provider, n: messages.length } });
    trajOf()?.record(sess.id, 'prompt', {
      phase: 'assemble',
      messages,
      wire,
      tools: input.tools ?? [],
    });
    sess.append('turn', { phase: 'start' });
    try {
      const { text, provider, toolCalls } = await runModel(messages, cfg, {
        tools: input.tools,
        signal: input.signal,
        onDelta: (chunk) => {
          ctx?.emit({ action: 'llm/delta', target: sess.id, payload: { bytes: chunk.length, chunk } });
          input.onDelta?.(chunk);
        },
        onHttp: (http) => {
          trajOf()?.record(sess.id, 'http', http);
        },
      });
      sess.append('message', {
        role: 'assistant',
        content: text,
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      });
      trajOf()?.record(sess.id, 'complete', { provider, text, toolCalls: toolCalls ?? [] });
      ctx?.emit({
        action: 'llm/result',
        target: sess.id,
        payload: { provider, bytes: text.length, tools: toolCalls?.length ?? 0 },
      });
      return { sessionId: sess.id, text, provider, toolCalls };
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
    description: 'complete：session 投影历史；支持 tool_calls、流式 delta、AbortSignal。默认 mock。',
    provides: ['llm'],
    config: { provider: 'mock', baseUrl: '', apiKey: '', model: 'gpt-4o-mini' },
    tier: 'standard',
  },
  inject: { session: true, logger: false, trajectory: false },
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
      '<p class="desc">ctx.llm.complete。默认 mock；provider=openai 或 deepseek 且有 baseUrl（deepseek 可省略，默认官方地址）才走 HTTP。</p>',
      '<div class="row"><span class="k">服务名</span><span class="v">llm</span></div>',
      '<div class="row"><span class="k">观测</span><span class="v">llm/request · delta · result</span></div>',
      '<div class="row"><span class="k">说明</span><span class="v">docs/plugins/llm.html</span></div>',
      '</div></body></html>',
    ].join(''),
  },
  register(c) {
    ctx = c;
    c.logger?.info?.(`llm 插件就绪（provider=${cfgOf().provider}）`);
    c.effect(() => () => {
      ctx = undefined;
    });
  },
};

export default llmPlugin;

import { randomUUID } from 'node:crypto';
import type { LlmMessage, LlmToolCall, LlmToolSpec } from '@wizard-harness/contracts';

export interface LlmAdapterConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface RunModelOpts {
  tools?: readonly LlmToolSpec[];
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
}

function mockReply(
  messages: LlmMessage[],
  tools?: readonly LlmToolSpec[],
): { text: string; toolCalls?: LlmToolCall[] } {
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === 'tool') {
    const name = lastMsg.name ?? 'tool';
    return { text: `[mock] [${name}] ${lastMsg.content}` };
  }
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const content = last?.content ?? '';
  const echo = /^echo\s+([\s\S]+)$/i.exec(content.trim());
  if (echo && tools?.some((t) => t.name === 'echo')) {
    return {
      text: '',
      toolCalls: [{ id: `mock-${randomUUID().slice(0, 8)}`, name: 'echo', args: { input: echo[1]!.trimEnd() } }],
    };
  }
  const text = last ? `[mock] ${last.content}` : '[mock] （无用户消息）';
  return { text };
}

function asOpenAiTools(tools: readonly LlmToolSpec[] | undefined) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: { type: 'object', additionalProperties: true },
    },
  }));
}

/** 内部 LlmMessage → OpenAI/DeepSeek Chat Completions 线格式（必须带 tool_calls.type） */
export function toWireMessages(messages: LlmMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      if (!m.tool_call_id) continue;
      out.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content ?? '' });
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
        })),
      });
      continue;
    }
    out.push({ role: m.role, content: m.content ?? '' });
  }
  return out;
}

function parseToolCalls(raw: unknown): LlmToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: LlmToolCall[] = [];
  for (const item of raw) {
    const row = item as { id?: string; function?: { name?: string; arguments?: string } };
    const name = row.function?.name;
    if (!name) continue;
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.function?.arguments || '{}') as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      args = {};
    }
    out.push({ id: row.id || randomUUID(), name, args });
  }
  return out.length ? out : undefined;
}

async function readSseText(
  res: Response,
  onDelta?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const body = res.body;
  if (!body) return '';
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  while (!signal?.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    for (const line of parts) {
      const payload = line.startsWith('data:') ? line.slice(5).trim() : '';
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const chunk = json.choices?.[0]?.delta?.content;
        if (chunk) {
          text += chunk;
          onDelta?.(chunk);
        }
      } catch {
        /* 跳过坏帧 */
      }
    }
  }
  if (signal?.aborted) throw new Error('llm 已取消');
  return text;
}

function isHttpProvider(provider: string): boolean {
  return provider === 'openai' || provider === 'deepseek';
}

function resolveCfg(cfg: LlmAdapterConfig): LlmAdapterConfig {
  const provider = cfg.provider.trim() || 'mock';
  let { baseUrl, model } = cfg;
  if (provider === 'deepseek') {
    if (!baseUrl) baseUrl = 'https://api.deepseek.com';
    if (!model || model === 'flash') model = 'deepseek-v4-flash';
  }
  return { ...cfg, provider, baseUrl, model };
}

export async function runModel(
  messages: LlmMessage[],
  raw: LlmAdapterConfig,
  opts: RunModelOpts = {},
): Promise<{ text: string; provider: string; toolCalls?: LlmToolCall[] }> {
  if (opts.signal?.aborted) throw new Error('llm 已取消');
  const cfg = resolveCfg(raw);
  if (!isHttpProvider(cfg.provider) || !cfg.baseUrl) {
    const mock = mockReply(messages, opts.tools);
    if (mock.text) opts.onDelta?.(mock.text);
    return { ...mock, provider: 'mock' };
  }
  const url = cfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const stream = Boolean(opts.onDelta) && !opts.tools?.length;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: toWireMessages(messages),
      temperature: 0,
      ...(asOpenAiTools(opts.tools) ? { tools: asOpenAiTools(opts.tools) } : {}),
      ...(stream ? { stream: true } : {}),
      ...(cfg.provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`llm http ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  if (stream) {
    const text = await readSseText(res, opts.onDelta, opts.signal);
    return { text, provider: cfg.provider };
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; tool_calls?: unknown } }>;
  };
  const msg = json.choices?.[0]?.message;
  const text = msg?.content ?? '';
  if (text) opts.onDelta?.(text);
  return { text, provider: cfg.provider, toolCalls: parseToolCalls(msg?.tool_calls) };
}

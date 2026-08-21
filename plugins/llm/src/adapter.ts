import type { LlmMessage } from '@wizard-harness/contracts';

export interface LlmAdapterConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

function mockReply(messages: LlmMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  return last ? `[mock] ${last.content}` : '[mock] （无用户消息）';
}

/** OpenAI 兼容 POST /chat/completions；失败抛错，由调用方写入观测 */
export async function runModel(
  messages: LlmMessage[],
  cfg: LlmAdapterConfig,
): Promise<{ text: string; provider: string }> {
  if (cfg.provider !== 'openai' || !cfg.baseUrl) {
    return { text: mockReply(messages), provider: 'mock' };
  }
  const url = cfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`llm http ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? '';
  return { text, provider: 'openai' };
}

/** 观测台 / obs-api 默认 RPC 白名单：只放 agent 试跑需要的方法，不含 console.exec / tools.call。 */
export type ExposeMap = Record<string, true | string[]>;

export const DEFAULT_EXPOSE: ExposeMap = {
  agent: ['list', 'stop'],
  promptContext: ['assemble', 'apply', 'setPersona', 'getPersona', 'inspect', 'usage'],
  agentLoop: ['run', 'cancel'],
};

export function parseExpose(raw: string | undefined): ExposeMap {
  if (raw === undefined || raw.trim() === '') return { ...DEFAULT_EXPOSE };
  if (raw.trim() === 'off' || raw.trim() === '{}') return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: ExposeMap = {};
    for (const [name, v] of Object.entries(parsed)) {
      if (v === true) out[name] = true;
      else if (Array.isArray(v)) out[name] = v.filter((m): m is string => typeof m === 'string');
    }
    return out;
  } catch {
    return { ...DEFAULT_EXPOSE };
  }
}

export function methodAllowed(expose: ExposeMap, service: string, method: string): boolean {
  const allow = expose[service];
  if (!allow) return false;
  return allow === true || (Array.isArray(allow) && allow.includes(method));
}

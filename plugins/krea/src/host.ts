import type { KreaInfo, KreaJobView, KreaModelInfo } from '@wizard-harness/contracts';
import {
  asBool,
  buildGenerateBody,
  clampInt,
  DEFAULT_KREA_MODEL,
  KREA_API_BASE,
  KREA_MODELS,
  resolveModel,
} from './models.js';

export const KREA_TOOL_NAMES = ['krea_models', 'krea_generate', 'krea_job'] as const;

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const RECENT_MAX = 12;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface KreaHostOptions {
  apiKey?: string;
  defaultModel?: string;
  fetch?: FetchLike;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  pollMs?: number;
  timeoutMs?: number;
  wait?: boolean;
  signal?: AbortSignal;
}

interface RawJob {
  job_id?: string;
  status?: string;
  created_at?: string;
  completed_at?: string | null;
  result?: unknown;
  error?: unknown;
}

export interface KreaHost {
  configured: boolean;
  defaultModel: string;
  info(): KreaInfo;
  models(): readonly KreaModelInfo[];
  generate(args: Record<string, unknown>): Promise<KreaJobView>;
  job(args: Record<string, unknown>): Promise<KreaJobView>;
}

export function createKreaHost(opts: KreaHostOptions = {}): KreaHost {
  const doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const sleep = opts.sleep ?? defaultSleep;
  const apiKey = String(opts.apiKey ?? '').trim();
  const defaultModel = String(opts.defaultModel ?? DEFAULT_KREA_MODEL).trim() || DEFAULT_KREA_MODEL;
  const pollMs = clampInt(opts.pollMs, 2000, 400, 15_000);
  const timeoutMs = clampInt(opts.timeoutMs, 180_000, 5_000, 600_000);
  const defaultWait = opts.wait !== false;
  const recent: KreaJobView[] = [];
  const catalog: KreaModelInfo[] = KREA_MODELS.map((m) => ({
    id: m.id,
    path: m.path,
    label: m.label,
    family: m.family,
  }));

  function remember(view: KreaJobView): KreaJobView {
    const idx = recent.findIndex((j) => j.job_id === view.job_id);
    if (idx >= 0) recent.splice(idx, 1);
    recent.unshift(view);
    while (recent.length > RECENT_MAX) recent.pop();
    return view;
  }

  function authHeaders(): HeadersInit {
    if (!apiKey) {
      throw new Error(
        '未配置 Krea API Key。请设置环境变量 WH_KREA_API_KEY，或在 krea 插件 config.apiKey 填写。到 https://www.krea.ai/settings/api-tokens 创建。',
      );
    }
    return {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
      'content-type': 'application/json',
    };
  }

  async function request(path: string, init: RequestInit): Promise<RawJob> {
    const url = path.startsWith('http') ? path : `${KREA_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await doFetch(url, { ...init, headers: authHeaders() });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text };
    }
    if (!res.ok) throw new Error(formatHttpError(res.status, data, text));
    return (data && typeof data === 'object' ? data : {}) as RawJob;
  }

  async function fetchJob(jobId: string, model = '', prompt?: string): Promise<KreaJobView> {
    const raw = await request(`/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' });
    return remember(toView(raw, model, prompt));
  }

  async function waitFor(job: KreaJobView, model: string, prompt: string): Promise<KreaJobView> {
    const started = (opts.now ?? Date.now)();
    let current = job;
    while (!TERMINAL.has(current.status)) {
      const elapsed = (opts.now ?? Date.now)() - started;
      if (elapsed >= timeoutMs) {
        return remember({
          ...current,
          hint: `仍在 ${current.status}，已等 ${Math.round(elapsed / 1000)}s。用 krea_job job_id=${current.job_id} 继续查。`,
        });
      }
      await sleep(pollMs, opts.signal);
      current = await fetchJob(current.job_id, model, prompt);
    }
    return current;
  }

  return {
    configured: Boolean(apiKey),
    defaultModel,
    info(): KreaInfo {
      return {
        configured: Boolean(apiKey),
        defaultModel,
        tools: [...KREA_TOOL_NAMES],
        models: catalog,
        recent: [...recent],
      };
    },
    models: () => catalog,
    async generate(args) {
      const model = resolveModel(String(args.model ?? '').trim() || defaultModel, defaultModel);
      const body = buildGenerateBody(model, args);
      const prompt = String(body.prompt ?? '');
      const raw = await request(`/generate/${model.path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      let view = remember(toView(raw, model.id, prompt));
      const wait = asBool(args.wait, defaultWait);
      if (wait && view.job_id && !TERMINAL.has(view.status)) {
        view = await waitFor(view, model.id, prompt);
      }
      if (!wait && !view.hint) {
        view = remember({ ...view, hint: `已提交。用 krea_job job_id=${view.job_id} 查结果。` });
      }
      return view;
    },
    async job(args) {
      const jobId = String(args.job_id ?? args.id ?? '').trim();
      if (!jobId) throw new Error('krea_job 需要 args.job_id');
      const prev = recent.find((j) => j.job_id === jobId);
      return fetchJob(jobId, prev?.model ?? '', prev?.prompt);
    },
  };
}

export async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('已取消');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('已取消'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function toView(raw: RawJob, model: string, prompt?: string): KreaJobView {
  const urls = extractUrls(raw.result);
  const err = formatJobError(raw.error);
  const status = String(raw.status ?? 'unknown');
  return {
    job_id: String(raw.job_id ?? ''),
    status,
    model,
    prompt: prompt || undefined,
    urls,
    error: err,
    hint:
      status === 'failed'
        ? err || '生成失败'
        : status === 'completed' && urls.length
          ? undefined
          : status === 'completed'
            ? '已完成但没有图片 URL'
            : undefined,
  };
}

function extractUrls(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const urls = (result as { urls?: unknown }).urls;
  if (Array.isArray(urls)) {
    return urls
      .map((item) => (typeof item === 'string' ? item : item && typeof item === 'object' ? String((item as { url?: string }).url ?? '') : ''))
      .filter(Boolean);
  }
  if (urls && typeof urls === 'object') {
    return Object.values(urls as Record<string, unknown>)
      .map((v) => String(v ?? ''))
      .filter((u) => /^https?:\/\//.test(u));
  }
  return [];
}

function formatJobError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const rec = error as { message?: string; code?: string; error?: string };
    return rec.message || rec.error || rec.code;
  }
  return String(error);
}

function formatHttpError(status: number, data: unknown, text: string): string {
  const rec = data && typeof data === 'object' ? (data as { error?: unknown; message?: string }) : undefined;
  const detail =
    typeof rec?.error === 'string'
      ? rec.error
      : rec?.error && typeof rec.error === 'object'
        ? formatJobError(rec.error)
        : rec?.message || text.slice(0, 240);
  if (status === 401) return `Krea 认证失败（401）。检查 WH_KREA_API_KEY。${detail}`;
  if (status === 402) return `Krea 额度不足（402）。${detail}`;
  if (status === 429) return `Krea 并发已满（429）。稍后重试。${detail}`;
  return `Krea HTTP ${status}${detail ? `：${detail}` : ''}`;
}

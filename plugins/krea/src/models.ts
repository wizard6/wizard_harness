export const KREA_API_BASE = 'https://api.krea.ai';
export const DEFAULT_KREA_MODEL = 'krea-2-medium';

export type KreaFamily = 'k2' | 'size';

export interface KreaModelDef {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly path: string;
  readonly label: string;
  readonly family: KreaFamily;
}

/** Agent 可直接用的文生图/图生图模型。path 对应 POST /generate/{path} */
export const KREA_MODELS: readonly KreaModelDef[] = [
  {
    id: 'krea-2-medium',
    aliases: ['krea-2', 'k2', 'krea'],
    path: 'image/krea/krea-2/medium',
    label: 'Krea 2 Medium — 默认插画',
    family: 'k2',
  },
  {
    id: 'krea-2-large',
    aliases: ['k2-large'],
    path: 'image/krea/krea-2/large',
    label: 'Krea 2 Large — 写实',
    family: 'k2',
  },
  {
    id: 'krea-2-turbo',
    aliases: ['k2-turbo'],
    path: 'image/krea/krea-2/medium-turbo',
    label: 'Krea 2 Turbo — 最快迭代',
    family: 'k2',
  },
  {
    id: 'nano-banana-pro',
    aliases: ['nb-pro'],
    path: 'image/google/nano-banana-pro',
    label: 'Nano Banana Pro — 4K / 文字',
    family: 'k2',
  },
  {
    id: 'nano-banana',
    aliases: ['nb'],
    path: 'image/google/nano-banana',
    label: 'Nano Banana — 通用',
    family: 'k2',
  },
  {
    id: 'nano-banana-2',
    aliases: ['nb2'],
    path: 'image/google/nano-banana-2',
    label: 'Nano Banana 2',
    family: 'k2',
  },
  {
    id: 'flux',
    aliases: ['flux-dev'],
    path: 'image/bfl/flux-1-dev',
    label: 'Flux 1 Dev — 快 / LoRA',
    family: 'size',
  },
  {
    id: 'seedream-4',
    aliases: ['seedream'],
    path: 'image/bytedance/seedream-4',
    label: 'Seedream 4 — 写实与文字',
    family: 'size',
  },
];

const RATIO_SIZE: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '4:3': { width: 1152, height: 864 },
  '3:2': { width: 1152, height: 768 },
  '16:9': { width: 1280, height: 720 },
  '2.35:1': { width: 1408, height: 600 },
  '4:5': { width: 1024, height: 1280 },
  '2:3': { width: 768, height: 1152 },
  '9:16': { width: 720, height: 1280 },
};

export function resolveModel(raw: string | undefined, fallback = DEFAULT_KREA_MODEL): KreaModelDef {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) {
    const def = KREA_MODELS.find((m) => m.id === fallback);
    if (!def) throw new Error(`默认模型不存在：${fallback}`);
    return def;
  }
  const hit = KREA_MODELS.find(
    (m) => m.id === key || m.aliases.includes(key) || m.path === key || m.path === key.replace(/^generate\//, ''),
  );
  if (hit) return hit;
  if (key.includes('/')) {
    const path = key.replace(/^generate\//, '').replace(/^\//, '');
    return {
      id: path,
      aliases: [],
      path,
      label: path,
      family: key.includes('flux') || key.includes('seedream') ? 'size' : 'k2',
    };
  }
  throw new Error(`未知模型 ${raw}。可用：${KREA_MODELS.map((m) => m.id).join('、')}`);
}

export function buildGenerateBody(model: KreaModelDef, args: Record<string, unknown>): Record<string, unknown> {
  const prompt = String(args.prompt ?? args.text ?? '').trim();
  if (!prompt) throw new Error('krea_generate 需要 args.prompt');
  const ratio = String(args.aspect_ratio ?? args.aspectRatio ?? '1:1').trim() || '1:1';
  const resolution = String(args.resolution ?? '1K').trim() || '1K';
  const body: Record<string, unknown> = { prompt };

  if (model.family === 'k2') {
    body.aspect_ratio = ratio;
    body.resolution = resolution;
    const creativity = String(args.creativity ?? '').trim();
    if (creativity) body.creativity = creativity;
  } else {
    const mapped = RATIO_SIZE[ratio] ?? RATIO_SIZE['1:1']!;
    body.width = clampInt(args.width, mapped.width, 512, 2368);
    body.height = clampInt(args.height, mapped.height, 512, 2368);
  }

  const seed = args.seed;
  if (seed !== undefined && seed !== null && seed !== '') {
    const n = Number(seed);
    if (Number.isFinite(n)) body.seed = n;
  }
  const imageUrl = String(args.image_url ?? args.imageUrl ?? '').trim();
  if (imageUrl) {
    body.image_url = imageUrl;
    if (args.strength !== undefined && args.strength !== null && args.strength !== '') {
      const s = Number(args.strength);
      if (Number.isFinite(s)) body.strength = s;
    }
  }
  return body;
}

export function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function asBool(raw: unknown, fallback: boolean): boolean {
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false;
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
  return fallback;
}

/** 记忆桶内部类型与常量（Ombre-Brain 对照数值） */
export interface BucketRecord {
  id: string;
  name: string;
  body: string;
  domain: string;
  tags: string[];
  valence: number;
  arousal: number;
  importance: number;
  type: 'dynamic' | 'permanent' | 'archived';
  created: number;
  lastActive: number;
  activationCount: number;
  pinned: boolean;
  resolved: boolean;
  dontSurface: boolean;
  whyRemembered: string;
  sourceTool: string;
}

export const LIMITS = {
  MAX_PINNED: 20,
  MAX_NAME: 120,
  MAX_BODY: 12000,
  MAX_WHY: 500,
  MAX_TAGS: 16,
  BREATH_DEFAULT: 5,
  RECENT_SLOTS: 3,
  RECENT_DAYS: 7,
  COLD_START_IMPORTANCE: 8,
  COLD_START_MAX: 2,
  COLD_TAIL: 2,
  GROW_MIN: 2,
  GROW_MAX: 6,
  ARCHIVE_SCORE: 0.3,
  LAMBDA: 0.05,
  FRESH_HALF_HOURS: 36,
  RESOLVED_FACTOR: 0.05,
  URGENCY_AROUSAL: 0.7,
  URGENCY_BOOST: 1.5,
  SEARCH_TIME_LAMBDA: 0.02,
  ASSEMBLE_CLIP: 280,
} as const;

export function clamp01(n: number, fallback = 0.5): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export function clampImportance(n: number, fallback = 5): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, Math.round(n)));
}

export function clip(text: string, n: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

export function nowMs(): number {
  return Date.now();
}

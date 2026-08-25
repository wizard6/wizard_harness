import { LIMITS, type BucketRecord } from './types.js';
import { calculateScore } from './decay.js';

function norm(s: string): string {
  return s.toLowerCase();
}

/** 简易模糊：子串命中 + 字符重叠比率 */
export function topicScore(query: string, b: BucketRecord): number {
  const q = norm(query.trim());
  if (!q) return 0;
  const name = norm(b.name);
  const domain = norm(b.domain);
  const tags = norm(b.tags.join(' '));
  const body = norm(b.body.slice(0, 1000));
  const hay = [
    { t: name, w: 3 },
    { t: domain, w: 2.5 },
    { t: tags, w: 2 },
    { t: body, w: 1 },
  ];
  let best = 0;
  for (const { t, w } of hay) {
    if (!t) continue;
    if (t.includes(q) || q.includes(t)) {
      best = Math.max(best, 100 * w);
      continue;
    }
    let hit = 0;
    for (const ch of q) if (t.includes(ch)) hit += 1;
    const ratio = hit / Math.max(q.length, 1);
    best = Math.max(best, ratio * 80 * w);
  }
  return best / 3; // normalize roughly into 0..100 scale contribution later
}

export function searchBuckets(
  buckets: BucketRecord[],
  opts: { query: string; domain?: string; maxResults?: number; includeArchive?: boolean },
  now = Date.now(),
): Array<{ bucket: BucketRecord; score: number }> {
  const q = opts.query.trim();
  if (!q) return [];
  const max = Math.min(20, Math.max(1, opts.maxResults ?? 8));
  const hits: Array<{ bucket: BucketRecord; score: number }> = [];

  for (const b of buckets) {
    if (!opts.includeArchive && b.type === 'archived') continue;
    if (opts.domain && b.domain !== opts.domain) continue;
    const topic = topicScore(q, b);
    if (topic < 8 && !norm(b.body).includes(norm(q)) && !norm(b.name).includes(norm(q))) continue;
    const days = Math.max(0, (now - b.lastActive) / 86_400_000);
    const time = Math.exp(-LIMITS.SEARCH_TIME_LAMBDA * days);
    const importance = b.importance / 10;
    const touch = Math.min(b.activationCount / 10, 1);
    let score = topic * 0.45 + time * 25 + importance * 15 + touch * 10;
    if (b.resolved) score *= 0.3;
    hits.push({ bucket: b, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, max);
}

export function rankForBreath(buckets: BucketRecord[], now = Date.now()): BucketRecord[] {
  return [...buckets].sort((a, b) => calculateScore(b, now) - calculateScore(a, now));
}

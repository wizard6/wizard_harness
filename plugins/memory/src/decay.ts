import { LIMITS, type BucketRecord } from './types.js';

/** Ombre-Brain 风格遗忘分数（读侧排序 / 归档判定） */
export function calculateScore(b: BucketRecord, now = Date.now()): number {
  if (b.type === 'permanent' || b.pinned) return 999;
  if (b.type === 'archived') return 0;

  const days = Math.max(0, (now - b.lastActive) / 86_400_000);
  const hours = Math.max(0, (now - b.lastActive) / 3_600_000);
  const activation = Math.max(0, b.activationCount);
  const actFactor = Math.pow(activation + 1, 0.3);
  const timeDecay = Math.exp(-LIMITS.LAMBDA * days);
  const timeWeight = 1 + Math.exp(-hours / LIMITS.FRESH_HALF_HOURS);
  const emotionWeight = 1 + clampArousal(b.arousal) * 0.8;
  const combined =
    days <= 3
      ? timeWeight * 0.7 + emotionWeight * 0.3
      : emotionWeight * 0.7 + timeWeight * 0.3;
  const resolvedFactor = b.resolved ? LIMITS.RESOLVED_FACTOR : 1;
  const urgency =
    !b.resolved && clampArousal(b.arousal) > LIMITS.URGENCY_AROUSAL
      ? LIMITS.URGENCY_BOOST
      : 1;

  return b.importance * actFactor * timeDecay * combined * resolvedFactor * urgency;
}

function clampArousal(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function shouldArchive(b: BucketRecord, now = Date.now()): boolean {
  if (b.type !== 'dynamic' || b.pinned) return false;
  return calculateScore(b, now) < LIMITS.ARCHIVE_SCORE;
}

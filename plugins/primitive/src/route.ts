import { APPROVED_PRIMITIVE_TAGS } from '@wizard-harness/contracts';
import type {
  PrimitiveLink,
  PrimitiveRecord,
  PrimitiveRoute,
  PrimitiveRouteLane,
  PrimitiveRouteOpts,
  PrimitiveRouteVia,
} from '@wizard-harness/contracts';

export const ROUTE_ALGORITHM =
  'seed → tree-decompose → then-walk → order(guide,evaluate,behavior) → load-cap';

const LANE_RANK: Record<PrimitiveRouteLane, number> = {
  guide: 0,
  evaluate: 1,
  behavior: 2,
  other: 3,
};

function laneOf(row: PrimitiveRecord): PrimitiveRouteLane {
  for (const tag of APPROVED_PRIMITIVE_TAGS) {
    if (row.tags.includes(tag)) return tag;
  }
  return 'other';
}

function haystack(row: PrimitiveRecord): string {
  return [row.id, row.name, row.summary, row.body, ...(row.tags ?? []), row.thinkKind ?? '']
    .join(' ')
    .toLowerCase();
}

export function routePrimitives(
  rows: readonly PrimitiveRecord[],
  links: readonly PrimitiveLink[],
  opts: PrimitiveRouteOpts = {},
): PrimitiveRoute {
  const limit = Math.min(12, Math.max(1, Number(opts.limit ?? 5) || 5));
  const hint = String(opts.hint ?? '').trim().toLowerCase();
  const startId = String(opts.startId ?? '').trim();
  const tag = String(opts.tag ?? '').trim();
  const byId = new Map(rows.map((r) => [r.id, r]));

  const seeds: PrimitiveRecord[] = [];
  if (startId && byId.has(startId)) {
    seeds.push(byId.get(startId)!);
  } else if (tag) {
    for (const row of rows) {
      if (row.tags.includes(tag) || row.thinkKind === tag) seeds.push(row);
    }
  } else if (hint) {
    for (const row of rows) {
      if (haystack(row).includes(hint)) seeds.push(row);
    }
  } else {
    for (const row of rows) {
      if (!row.parentId || !byId.has(row.parentId)) seeds.push(row);
    }
  }

  type Cand = { score: number; via: PrimitiveRouteVia; reason: string };
  const cand = new Map<string, Cand>();
  const bump = (id: string, score: number, via: PrimitiveRouteVia, reason: string) => {
    if (!byId.has(id)) return;
    const prev = cand.get(id);
    if (!prev || score > prev.score) cand.set(id, { score, via, reason });
  };

  for (const row of seeds) {
    bump(row.id, 100, 'seed', '入口');
  }
  for (const row of seeds) {
    for (const child of rows) {
      if (child.parentId === row.id) bump(child.id, 72, 'tree', `分解自 ${row.name}`);
    }
    if (row.parentId) {
      const p = byId.get(row.parentId);
      if (p) bump(p.id, 48, 'tree', `父级上下文 ${p.name}`);
    }
  }
  for (const link of links) {
    const fromSeed = cand.get(link.source)?.via === 'seed' || seeds.some((s) => s.id === link.source);
    const toSeed = cand.get(link.target)?.via === 'seed' || seeds.some((s) => s.id === link.target);
    const kind = link.kind === 'then' || link.kind === 'constrains' || link.kind === 'relates' ? link.kind : 'relates';
    const weight = kind === 'then' ? 80 : kind === 'constrains' ? 58 : 42;
    if (fromSeed) {
      const src = byId.get(link.source);
      bump(link.target, weight, kind, `${kind} ← ${src?.name ?? link.source}`);
    }
    if (toSeed) {
      const tgt = byId.get(link.target);
      bump(link.source, weight - 8, kind, `${kind} → ${tgt?.name ?? link.target}`);
    }
  }

  const picked = [...cand.entries()]
    .map(([id, meta]) => ({ id, ...meta, lane: laneOf(byId.get(id)!) }))
    .sort((a, b) => {
      const lane = LANE_RANK[a.lane] - LANE_RANK[b.lane];
      if (lane !== 0) return lane;
      return b.score - a.score;
    })
    .slice(0, limit);

  const pickedIds = new Set(picked.map((p) => p.id));
  const steps = picked.map((p, i) => {
    const row = byId.get(p.id)!;
    return {
      order: i + 1,
      id: row.id,
      name: row.name,
      via: p.via,
      reason: p.reason,
      score: p.score,
      lane: p.lane,
    };
  });
  const edges = links.filter((l) => pickedIds.has(l.source) && pickedIds.has(l.target));

  return {
    algorithm: ROUTE_ALGORITHM,
    query: { hint: hint || undefined, startId: startId || undefined, tag: tag || undefined, limit },
    seeds: seeds.map((s) => s.id),
    steps,
    edges,
    load: steps.length,
    loadCap: limit,
  };
}

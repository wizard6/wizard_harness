import { APPROVED_PRIMITIVE_TAGS } from '@wizard-harness/contracts';
import type {
  PrimitiveInfo,
  PrimitiveLink,
  PrimitiveNeighbor,
  PrimitiveRecord,
  PrimitiveRoute,
  PrimitiveRouteOpts,
  PrimitiveSnapshot,
  PrimitiveTagCount,
  PrimitiveTreeNode,
} from '@wizard-harness/contracts';
import { SEED_LINKS, SEED_PRIMITIVES } from './catalog.js';
import { routePrimitives } from './route.js';

function toInfo(row: PrimitiveRecord): PrimitiveInfo {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    tags: row.tags,
    thinkKind: row.thinkKind,
    parentId: row.parentId,
  };
}

function tagCounts(rows: readonly PrimitiveRecord[]): PrimitiveTagCount[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const keys = new Set<string>(row.tags);
    if (row.thinkKind) keys.add(row.thinkKind);
    for (const tag of keys) map.set(tag, (map.get(tag) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

function matchesTag(row: PrimitiveRecord, tag: string): boolean {
  const needle = tag.trim();
  if (!needle) return true;
  return row.tags.includes(needle) || row.thinkKind === needle;
}

function buildTree(rows: readonly PrimitiveRecord[]): PrimitiveTreeNode[] {
  const ids = new Set(rows.map((r) => r.id));
  const kids = new Map<string, PrimitiveRecord[]>();
  const roots: PrimitiveRecord[] = [];
  for (const row of rows) {
    const parent = row.parentId?.trim();
    if (parent && parent !== row.id && ids.has(parent)) {
      const list = kids.get(parent) ?? [];
      list.push(row);
      kids.set(parent, list);
    } else {
      roots.push(row);
    }
  }
  const walking = new Set<string>();
  function node(row: PrimitiveRecord): PrimitiveTreeNode | undefined {
    if (walking.has(row.id)) return undefined;
    walking.add(row.id);
    const children = (kids.get(row.id) ?? [])
      .map(node)
      .filter((n): n is PrimitiveTreeNode => n !== undefined);
    walking.delete(row.id);
    return { id: row.id, name: row.name, children };
  }
  return roots.map(node).filter((n): n is PrimitiveTreeNode => n !== undefined);
}

export function createPrimitiveHost(
  seed: readonly PrimitiveRecord[] = SEED_PRIMITIVES,
  seedLinks: readonly PrimitiveLink[] = SEED_LINKS,
) {
  const byId = new Map(seed.map((row) => [row.id, row]));
  const links = seedLinks.filter((l) => byId.has(l.source) && byId.has(l.target) && l.source !== l.target);

  function list(): PrimitiveInfo[] {
    return seed.map(toInfo);
  }

  function get(id: string): PrimitiveRecord | undefined {
    const row = byId.get(id.trim());
    if (!row) return undefined;
    return { ...row, tags: [...row.tags] };
  }

  function tags(): PrimitiveTagCount[] {
    return tagCounts(seed);
  }

  function listByTag(tag: string): PrimitiveInfo[] {
    return seed.filter((row) => matchesTag(row, tag)).map(toInfo);
  }

  function tree(): PrimitiveTreeNode[] {
    return buildTree(seed);
  }

  function neighbors(id: string): PrimitiveNeighbor[] {
    const row = byId.get(id.trim());
    if (!row) return [];
    const out: PrimitiveNeighbor[] = [];
    const parent = row.parentId?.trim();
    if (parent) {
      const p = byId.get(parent);
      if (p) out.push({ id: p.id, name: p.name, relation: 'parent', dir: 'in' });
    }
    for (const child of seed) {
      if (child.parentId === row.id) {
        out.push({ id: child.id, name: child.name, relation: 'child', dir: 'out' });
      }
    }
    for (const link of links) {
      if (link.source === row.id) {
        const t = byId.get(link.target);
        if (t) out.push({ id: t.id, name: t.name, relation: 'link', dir: 'out', kind: link.kind });
      } else if (link.target === row.id) {
        const s = byId.get(link.source);
        if (s) out.push({ id: s.id, name: s.name, relation: 'link', dir: 'in', kind: link.kind });
      }
    }
    return out;
  }

  function snapshot(): PrimitiveSnapshot {
    return {
      primitives: list(),
      tags: tags(),
      approvedTags: [...APPROVED_PRIMITIVE_TAGS],
      tree: tree(),
      links: links.map((l) => ({ ...l })),
    };
  }

  function route(opts: PrimitiveRouteOpts = {}): PrimitiveRoute {
    return routePrimitives(seed, links, opts);
  }

  return { snapshot, list, get, tags, listByTag, tree, links: () => links.map((l) => ({ ...l })), neighbors, route };
}

export type PrimitiveHost = ReturnType<typeof createPrimitiveHost>;

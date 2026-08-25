import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { LIMITS, clip, type BucketRecord } from './types.js';

function escYaml(s: string): string {
  if (/^[\w./:@+-]+$/.test(s) && !/^(true|false|null|yes|no)$/i.test(s)) return s;
  return JSON.stringify(s);
}

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, unknown> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (!key) continue;
    if (val.startsWith('[') && val.endsWith(']')) {
      try {
        meta[key] = JSON.parse(val.replace(/'/g, '"'));
        continue;
      } catch {
        /* fallthrough */
      }
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      meta[key] = val.slice(1, -1);
      continue;
    }
    if (val === 'true' || val === 'false') {
      meta[key] = val === 'true';
      continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(val)) {
      meta[key] = Number(val);
      continue;
    }
    meta[key] = val;
  }
  return { meta, body: m[2]!.replace(/^\r?\n/, '') };
}

function asStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function asBool(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

function asNum(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function asMs(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return t;
  }
  return fallback;
}

export function serializeBucket(b: BucketRecord): string {
  const lines = [
    '---',
    `id: ${escYaml(b.id)}`,
    `name: ${escYaml(b.name)}`,
    `domain: ${escYaml(b.domain)}`,
    `tags: [${b.tags.map((t) => escYaml(t)).join(', ')}]`,
    `valence: ${b.valence}`,
    `arousal: ${b.arousal}`,
    `importance: ${b.importance}`,
    `type: ${b.type}`,
    `created: ${new Date(b.created).toISOString()}`,
    `last_active: ${new Date(b.lastActive).toISOString()}`,
    `activation_count: ${b.activationCount}`,
    `source_tool: ${escYaml(b.sourceTool)}`,
  ];
  if (b.pinned) lines.push('pinned: true');
  if (b.resolved) lines.push('resolved: true');
  if (b.dontSurface) lines.push('dont_surface: true');
  if (b.whyRemembered) lines.push(`why_remembered: ${escYaml(b.whyRemembered)}`);
  lines.push('---', '', b.body.replace(/\r\n/g, '\n').trimEnd(), '');
  return lines.join('\n');
}

export function parseBucket(raw: string, fallbackId: string): BucketRecord {
  const { meta, body } = parseFrontmatter(raw);
  const now = Date.now();
  const typeRaw = String(meta.type ?? 'dynamic');
  const type =
    typeRaw === 'permanent' || typeRaw === 'archived' ? typeRaw : 'dynamic';
  return {
    id: String(meta.id ?? fallbackId),
    name: clip(String(meta.name ?? fallbackId), LIMITS.MAX_NAME) || fallbackId,
    body: body.slice(0, LIMITS.MAX_BODY),
    domain: String(meta.domain ?? '未分类') || '未分类',
    tags: asStringList(meta.tags).slice(0, LIMITS.MAX_TAGS),
    valence: Math.min(1, Math.max(0, asNum(meta.valence, 0.5))),
    arousal: Math.min(1, Math.max(0, asNum(meta.arousal, 0.5))),
    importance: Math.min(10, Math.max(1, Math.round(asNum(meta.importance, 5)))),
    type,
    created: asMs(meta.created, now),
    lastActive: asMs(meta.last_active ?? meta.lastActive, now),
    activationCount: Math.max(0, asNum(meta.activation_count ?? meta.activationCount, 0)),
    pinned: asBool(meta.pinned),
    resolved: asBool(meta.resolved),
    dontSurface: asBool(meta.dont_surface ?? meta.dontSurface),
    whyRemembered: clip(String(meta.why_remembered ?? meta.whyRemembered ?? ''), LIMITS.MAX_WHY),
    sourceTool: String(meta.source_tool ?? meta.sourceTool ?? 'hold'),
  };
}

function domainDir(root: string, type: BucketRecord['type'], domain: string): string {
  const safeDomain = domain.replace(/[<>:"/\\|?*\0]/g, '_').trim() || '未分类';
  if (type === 'archived') return join(root, 'archive', safeDomain);
  if (type === 'permanent') return join(root, 'permanent', safeDomain);
  return join(root, 'dynamic', safeDomain);
}

function fileOf(root: string, b: BucketRecord): string {
  return join(domainDir(root, b.type, b.domain), `${b.id}.md`);
}

function walkMd(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walkMd(p, out);
    else if (name.isFile() && name.name.endsWith('.md')) out.push(p);
  }
  return out;
}

export class MemoryVault {
  constructor(readonly root: string) {
    mkdirSync(join(root, 'dynamic'), { recursive: true });
    mkdirSync(join(root, 'permanent'), { recursive: true });
    mkdirSync(join(root, 'archive'), { recursive: true });
  }

  list(): BucketRecord[] {
    const files = walkMd(this.root);
    const byId = new Map<string, BucketRecord>();
    for (const file of files) {
      try {
        const raw = readFileSync(file, 'utf8');
        const id = basename(file, '.md');
        const b = parseBucket(raw, id);
        byId.set(b.id, b);
      } catch {
        /* skip corrupt */
      }
    }
    return [...byId.values()];
  }

  get(id: string): BucketRecord | undefined {
    return this.list().find((b) => b.id === id);
  }

  save(b: BucketRecord): void {
    const path = fileOf(this.root, b);
    mkdirSync(dirname(path), { recursive: true });
    const existing = this.findPath(b.id);
    writeFileSync(path, serializeBucket(b), 'utf8');
    if (existing && existing !== path && existsSync(existing)) {
      try {
        unlinkSync(existing);
      } catch {
        /* ignore */
      }
    }
  }

  private findPath(id: string): string | undefined {
    return walkMd(this.root).find((f) => basename(f, '.md') === id);
  }
}

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type {
  SkillDetail,
  SkillInfo,
  SkillsService,
  SkillsSnapshot,
} from '@wizard-harness/contracts';
import { discoverSkills, readSkillBody } from './scan.js';

const LIMITS = { CATALOG_CLIP: 180, BODY_CLIP: 12_000 };

export type SkillsHost = SkillsService & {
  readonly scanDirs: readonly string[];
  renderCatalog(): string;
  renderAlwaysApply(): { id: string; text: string }[];
};

export interface SkillsHostOpts {
  scanDirs?: readonly string[];
  workspace?: string;
  now?: () => number;
  onChange?: () => void;
}

interface SkillRow {
  id: string;
  name: string;
  description: string;
  path: string;
  enabled: boolean;
  alwaysApply: boolean;
  body: string;
}

function defaultDirs(workspace: string): string[] {
  const home = homedir();
  const rows = [
    join(home, '.cursor', 'skills'),
    join(home, '.cursor', 'skills-cursor'),
    join(workspace, '.cursor', 'skills'),
  ];
  return rows.map((p) => resolve(p));
}

function mergePrefs(rows: SkillRow[], prefs: Map<string, { enabled: boolean; alwaysApply: boolean }>): SkillRow[] {
  return rows.map((row) => {
    const pref = prefs.get(row.id);
    if (!pref) return row;
    return { ...row, enabled: pref.enabled, alwaysApply: pref.alwaysApply };
  });
}

function snapshotOf(rows: SkillRow[], scanDirs: string[], scannedAt: number): SkillsSnapshot {
  const skills = rows.map(({ body: _b, ...info }) => info);
  return {
    scannedAt,
    scanDirs,
    skills,
    enabledCount: skills.filter((s) => s.enabled).length,
    alwaysApplyCount: skills.filter((s) => s.enabled && s.alwaysApply).length,
  };
}

export function createSkillsHost(opts: SkillsHostOpts = {}): SkillsHost {
  const now = opts.now ?? Date.now;
  const workspace = resolve(opts.workspace?.trim() || process.env.WH_WORKSPACE || process.cwd());
  const scanDirs = (opts.scanDirs?.length ? opts.scanDirs : defaultDirs(workspace)).map((d) => resolve(d));
  const prefs = new Map<string, { enabled: boolean; alwaysApply: boolean }>();
  let rows: SkillRow[] = [];
  let scannedAt = 0;

  const reload = (): SkillsSnapshot => {
    const discovered = discoverSkills(scanDirs);
    rows = discovered.map((info) => ({
      ...info,
      body: readSkillBody(info.path),
      enabled: prefs.get(info.id)?.enabled ?? info.enabled,
      alwaysApply: prefs.get(info.id)?.alwaysApply ?? info.alwaysApply,
    }));
    rows = mergePrefs(rows, prefs);
    scannedAt = now();
    opts.onChange?.();
    return snapshotOf(rows, scanDirs, scannedAt);
  };

  reload();

  const api: SkillsService = {
    snapshot: () => snapshotOf(rows, scanDirs, scannedAt),
    list: () => snapshotOf(rows, scanDirs, scannedAt).skills,
    get(id) {
      const row = rows.find((s) => s.id === id);
      if (!row) return undefined;
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        path: row.path,
        enabled: row.enabled,
        alwaysApply: row.alwaysApply,
        body: row.body,
      } satisfies SkillDetail;
    },
    scan: () => reload(),
    setEnabled(id, enabled) {
      const row = rows.find((s) => s.id === id);
      if (!row) throw new Error(`技能不存在：${id}`);
      prefs.set(id, { enabled, alwaysApply: row.alwaysApply });
      row.enabled = enabled;
      opts.onChange?.();
      return snapshotOf(rows, scanDirs, scannedAt);
    },
    setAlwaysApply(id, alwaysApply) {
      const row = rows.find((s) => s.id === id);
      if (!row) throw new Error(`技能不存在：${id}`);
      prefs.set(id, { enabled: row.enabled, alwaysApply });
      row.alwaysApply = alwaysApply;
      opts.onChange?.();
      return snapshotOf(rows, scanDirs, scannedAt);
    },
  };

  return Object.assign(api, {
    scanDirs,
    renderCatalog(): string {
      const enabled = rows.filter((s) => s.enabled);
      if (!enabled.length) return '';
      const lines = enabled.map((s) => {
        const desc = s.description.length > LIMITS.CATALOG_CLIP ? `${s.description.slice(0, LIMITS.CATALOG_CLIP)}…` : s.description;
        return `- **${s.name}** (\`${s.id}\`): ${desc}`;
      });
      return [
        '# 可用 Agent Skills',
        '下列技能可按需读取全文（skill_read）。名称含 skill 的段落会计入上下文用量中的 Skills 分类。',
        lines.join('\n'),
      ].join('\n');
    },
    renderAlwaysApply(): { id: string; text: string }[] {
      return rows
        .filter((s) => s.enabled && s.alwaysApply && s.body.trim())
        .map((s) => ({
          id: s.id,
          text: s.body.length > LIMITS.BODY_CLIP ? `${s.body.slice(0, LIMITS.BODY_CLIP)}\n…（截断）` : s.body,
        }));
    },
  }) as SkillsHost;
}


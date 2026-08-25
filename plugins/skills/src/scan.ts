import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SkillInfo } from '@wizard-harness/contracts';
import { firstParagraph, parseSkillMarkdown } from './parse.js';

const LIMITS = { MAX_SKILLS: 128, MAX_FILE: 256 * 1024 };

function slugId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function readSkillFile(file: string): { parsed: ReturnType<typeof parseSkillMarkdown>; raw: string } {
  const buf = readFileSync(file);
  if (buf.length > LIMITS.MAX_FILE) throw new Error(`SKILL.md 过大：${file}`);
  const raw = buf.toString('utf8');
  return { raw, parsed: parseSkillMarkdown(raw) };
}

function scanDir(root: string, out: SkillInfo[], seen: Set<string>): void {
  if (!existsSync(root)) return;
  let entries: string[];
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);
  } catch {
    return;
  }
  for (const name of entries) {
    if (out.length >= LIMITS.MAX_SKILLS) return;
    const dir = join(root, name);
    const file = join(dir, 'SKILL.md');
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    try {
      const { parsed } = readSkillFile(file);
      const id = slugId(name) || slugId(parsed.name ?? 'skill') || 'skill';
      const key = `${resolve(root)}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id,
        name: parsed.name?.trim() || name,
        description: parsed.description?.trim() || firstParagraph(parsed.body),
        path: file,
        enabled: true,
        alwaysApply: parsed.alwaysApply,
      });
    } catch {
      /* 跳过损坏条目 */
    }
  }
}

export function discoverSkills(dirs: readonly string[]): SkillInfo[] {
  const out: SkillInfo[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) scanDir(resolve(dir), out, seen);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function readSkillBody(path: string): string {
  const { parsed } = readSkillFile(path);
  return parsed.body;
}

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TextDecoder } from 'node:util';

export const FS_LIMITS = {
  MAX_READ: 512 * 1024,
  MAX_GLOB: 200,
  MAX_GREP: 80,
  SKIP_DIRS: new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '.turbo', 'out']),
};

export function decode(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gbk').decode(buf);
  }
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…（截断，共 ${text.length} 字符）`;
}

export function asString(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value);
}

export function globToRegExp(glob: string): RegExp {
  let g = glob.replaceAll('\\', '/').trim();
  if (g.startsWith('./')) g = g.slice(2);
  if (!g) throw new Error('glob 不能为空');
  const re = g
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '\u0002')
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0001/g, '(?:.*/)?')
    .replace(/\u0000/g, '.*')
    .replace(/\u0002/g, '[^/]');
  return new RegExp(`^${re}$`);
}

function isSkippedDir(name: string): boolean {
  return FS_LIMITS.SKIP_DIRS.has(name);
}

export function isProbablyBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export function walkFiles(rootAbs: string, startAbs: string, out: string[], cap: number): void {
  if (out.length >= cap) return;
  if (!existsSync(startAbs)) return;
  const st = statSync(startAbs);
  if (st.isFile()) {
    out.push(startAbs);
    return;
  }
  if (!st.isDirectory()) return;
  let names: string[];
  try {
    names = readdirSync(startAbs);
  } catch {
    return;
  }
  for (const name of names) {
    if (out.length >= cap) return;
    if (isSkippedDir(name)) continue;
    const next = join(startAbs, name);
    let nextSt;
    try {
      nextSt = statSync(next);
    } catch {
      continue;
    }
    if (nextSt.isDirectory()) walkFiles(rootAbs, next, out, cap);
    else if (nextSt.isFile()) out.push(next);
  }
}

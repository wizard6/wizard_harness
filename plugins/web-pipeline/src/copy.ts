import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'dist', '.DS_Store']);

function shouldSkip(name: string): boolean {
  if (SKIP.has(name)) return true;
  if (name.endsWith('.apk')) return true;
  return false;
}

/** 列出站点根下的可见文件（不含 node_modules / dist / apk） */
export function listSiteFiles(root: string): string[] {
  const dir = resolve(root);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (shouldSkip(name)) continue;
      const full = join(current, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else out.push(relative(dir, full).replaceAll('\\', '/'));
    }
  };
  walk(dir);
  return out.sort();
}

export function copySite(source: string, dest: string): string[] {
  const from = resolve(source);
  const to = resolve(dest);
  if (from !== to && existsSync(to)) {
    rmSync(to, { recursive: true, force: true });
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const name = src.split(/[/\\]/).pop() ?? '';
      return !shouldSkip(name);
    },
  });
  return listSiteFiles(to);
}

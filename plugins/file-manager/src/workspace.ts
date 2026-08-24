import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { PluginContext } from '@wizard-harness/core';

const MAX_WRITE = 512 * 1024;

export function assertInside(root: string, candidate: string): string {
  const rootAbs = resolve(root);
  if (candidate.includes('\0')) throw new Error('路径非法');
  const abs = isAbsolute(candidate) ? resolve(candidate) : resolve(rootAbs, candidate);
  const rel = relative(rootAbs, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`路径越出工作区：${candidate}`);
  return abs;
}

export function defaultWorkspaceRoot(ctx: PluginContext): string {
  const fromCfg = String(ctx.config.root ?? '').trim();
  if (fromCfg) return resolve(fromCfg);
  const fromEnv = String(process.env.WH_WORKSPACE_ROOT ?? '').trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(process.cwd());
}

export function createWorkspaceHost(root: string) {
  const rootAbs = resolve(root);
  mkdirSync(rootAbs, { recursive: true });

  return {
    info() {
      return { root: rootAbs };
    },
    list(rel = '.') {
      const dir = assertInside(rootAbs, rel);
      if (!existsSync(dir)) return { path: rel.replaceAll('\\', '/') || '.', entries: [] as const };
      const st = statSync(dir);
      if (!st.isDirectory()) throw new Error(`不是目录：${rel}`);
      const entries = readdirSync(dir).map((name) => {
        const kind = statSync(resolve(dir, name)).isDirectory() ? ('dir' as const) : ('file' as const);
        return { name, kind };
      });
      entries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return { path: rel.replaceAll('\\', '/') || '.', entries };
    },
    read(rel: string) {
      const file = assertInside(rootAbs, rel);
      if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`文件不存在：${rel}`);
      const content = readFileSync(file, 'utf8');
      return { path: rel.replaceAll('\\', '/'), content, lines: content.split('\n').length };
    },
    write(rel: string, content: string) {
      if (typeof content !== 'string') throw new Error('write 需要字符串 content');
      if (content.length > MAX_WRITE) throw new Error(`超过 ${MAX_WRITE} 字节上限`);
      const file = assertInside(rootAbs, rel);
      if (file === rootAbs || file.endsWith(sep)) throw new Error('不能把根目录当文件写');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content, 'utf8');
      return { ok: true as const, path: rel.replaceAll('\\', '/') };
    },
  };
}

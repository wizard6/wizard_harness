import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { PluginContext } from '@wizard-harness/core';

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

export function createReadonlyWorkspace(root: string) {
  const rootAbs = resolve(root);
  mkdirSync(rootAbs, { recursive: true });
  return {
    info() {
      return { root: rootAbs };
    },
    read(rel: string) {
      const file = assertInside(rootAbs, rel);
      if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`文件不存在：${rel}`);
      const content = readFileSync(file, 'utf8');
      return { path: rel.replaceAll('\\', '/'), content, lines: content.split('\n').length };
    },
  };
}

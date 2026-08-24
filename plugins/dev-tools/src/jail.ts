import { isAbsolute, relative, resolve } from 'node:path';

export function assertInside(root: string, candidate: string): string {
  const rootAbs = resolve(root);
  if (candidate.includes('\0')) throw new Error('路径非法');
  const abs = isAbsolute(candidate) ? resolve(candidate) : resolve(rootAbs, candidate);
  const rel = relative(rootAbs, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`路径越出工作区：${candidate}`);
  return abs;
}

export function toPosix(rel: string): string {
  return rel.replaceAll('\\', '/') || '.';
}

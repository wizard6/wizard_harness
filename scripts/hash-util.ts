import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 仓库根 */
export const ROOT = join(import.meta.dirname, '..');

/** 被检查源码目录（含 .ts/.tsx，排除 node_modules/dist/.ignored_core/测试文件） */
const SOURCE_DIRS = ['core/src', 'contracts/src', 'plugins', 'obs'];

/** 收集全部待检查文件（绝对路径，排序） */
export function collectFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (['node_modules', 'dist', '.ignored_core'].includes(ent.name)) continue;
        walk(p);
      } else if (
        (ent.name.endsWith('.ts') || ent.name.endsWith('.tsx')) &&
        !ent.name.endsWith('.spec.ts') &&
        !ent.name.endsWith('.d.ts')
      ) {
        out.push(p);
      }
    }
  };
  for (const d of SOURCE_DIRS) {
    const full = join(ROOT, d);
    if (existsSync(full)) walk(full);
  }
  return out.sort();
}

/** 绝对路径 → 相对路径（仓库内唯一标识） */
export function toRel(abs: string): string {
  return abs.slice(ROOT.length + 1).replace(/\\/g, '/');
}

/** 行尾规范化（CRLF → LF）：避免 git autocrlf 导致的换行符差异误判"已修改" */
export function normalize(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { SandboxEntry, SandboxList, SandboxService } from '@wizard-harness/contracts';

const MAX_WRITE = 256 * 1024;

export function assertInside(root: string, candidate: string): string {
  const rootAbs = resolve(root);
  if (candidate.includes('\0')) throw new Error('路径非法');
  const abs = isAbsolute(candidate) ? resolve(candidate) : resolve(rootAbs, candidate);
  const rel = relative(rootAbs, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`路径越出沙箱：${candidate}`);
  return abs;
}

export function createSandboxHost(root: string): SandboxService {
  const rootAbs = resolve(root);
  mkdirSync(rootAbs, { recursive: true });

  return {
    info() {
      return { root: rootAbs };
    },
    resolve(rel = '.') {
      return assertInside(rootAbs, rel);
    },
    list(rel = '.') {
      const dir = assertInside(rootAbs, rel);
      if (!existsSync(dir)) return { path: rel || '.', entries: [] };
      const st = statSync(dir);
      if (!st.isDirectory()) throw new Error(`不是目录：${rel}`);
      const entries: SandboxEntry[] = readdirSync(dir).map((name) => {
        const kind = statSync(resolve(dir, name)).isDirectory() ? 'dir' : 'file';
        return { name, kind };
      });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      return { path: rel.replaceAll('\\', '/') || '.', entries };
    },
    read(rel) {
      const file = assertInside(rootAbs, rel);
      if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`文件不存在：${rel}`);
      return readFileSync(file, 'utf8');
    },
    write(rel, content) {
      if (typeof content !== 'string') throw new Error('write 需要字符串 content');
      if (content.length > MAX_WRITE) throw new Error(`超过 ${MAX_WRITE} 字节上限`);
      const file = assertInside(rootAbs, rel);
      if (file === rootAbs || file.endsWith(sep)) throw new Error('不能把根目录当文件写');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content, 'utf8');
    },
  };
}

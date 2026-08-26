import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify, TextDecoder } from 'node:util';
import type { GitProbe, GitRunResult } from '@wizard-harness/contracts';

const execFileP = promisify(execFile);

const LIMITS = { MAX_OUT: 120_000, DEFAULT_TIMEOUT_MS: 60_000 };

const IO = {
  decode(buf: Buffer): string {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      return new TextDecoder('gbk').decode(buf);
    }
  },
  clip(text: string): string {
    if (text.length <= LIMITS.MAX_OUT) return text;
    return `${text.slice(0, LIMITS.MAX_OUT)}\n…（截断，共 ${text.length} 字符）`;
  },
};

let cachedProbe: GitProbe | undefined;

export function probeGit(force = false): GitProbe {
  if (cachedProbe && !force) return cachedProbe;
  const git = process.platform === 'win32' ? 'git.exe' : 'git';
  try {
    const r = execFileSync(git, ['--version'], { encoding: 'utf8', windowsHide: true });
    const version = r.trim();
    cachedProbe = { available: true, version, path: git };
    return cachedProbe;
  } catch {
    cachedProbe = {
      available: false,
      hint:
        '未检测到 git。请安装 Git for Windows 并确保 git 在 PATH 中；' +
        '或后续通过 MCP（GitHub/GitLab）做远端操作。',
    };
    return cachedProbe;
  }
}

export function resetGitProbeCache(): void {
  cachedProbe = undefined;
}

export function resolveInWorkspace(root: string, relPath: string): string {
  const rootAbs = resolve(root);
  const candidate = relPath.trim() || '.';
  const abs = isAbsolute(candidate) ? resolve(candidate) : resolve(rootAbs, candidate);
  const rel = relative(rootAbs, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`路径越出工作区：${relPath}`);
  return abs;
}

export function isGitRepo(dir: string): boolean {
  return existsSync(resolve(dir, '.git'));
}

/** 自 start 向上查找含 .git 的目录 */
export function findGitRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (isGitRepo(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export async function runGit(
  cwd: string,
  args: readonly string[],
  timeoutMs = LIMITS.DEFAULT_TIMEOUT_MS,
): Promise<GitRunResult> {
  const probe = probeGit();
  if (!probe.available) throw new Error(probe.hint ?? 'git 不可用');
  const git = probe.path ?? 'git';
  try {
    const { stdout, stderr } = await execFileP(git, [...args], {
      cwd: resolve(cwd),
      encoding: 'buffer',
      timeout: Math.min(300_000, Math.max(1_000, timeoutMs)),
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return {
      ok: true,
      stdout: IO.clip(IO.decode(stdout)),
      stderr: IO.clip(IO.decode(stderr)),
      code: 0,
    };
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; code?: number | null; message?: string };
    return {
      ok: false,
      stdout: IO.clip(e.stdout ? IO.decode(e.stdout) : ''),
      stderr: IO.clip(e.stderr ? IO.decode(e.stderr) : String(e.message ?? err)),
      code: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

export async function currentBranch(cwd: string): Promise<string | undefined> {
  const r = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], 10_000);
  if (!r.ok) return undefined;
  return r.stdout.trim() || undefined;
}

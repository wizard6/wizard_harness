import { exec } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify, TextDecoder } from 'node:util';
import type { ToolboxScriptConfig } from './config.js';

const execP = promisify(exec);

const RUN = {
  CMD_PREFIX: process.platform === 'win32' ? 'chcp 65001 >nul && ' : '',
  MAX_OUT: 100_000,
};

const IO = {
  decode(buf: Buffer): string {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      return new TextDecoder('gbk').decode(buf);
    }
  },
  clip(text: string): string {
    if (text.length <= RUN.MAX_OUT) return text;
    return `${text.slice(0, RUN.MAX_OUT)}\n…（截断，共 ${text.length} 字符）`;
  },
};

function asString(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value);
}

export interface RunContext {
  readonly workspace: string;
  readonly fallbackCwd: string;
  readonly args: Record<string, unknown>;
}

function resolveInWorkspace(workspace: string, relPath: string): string {
  const root = resolve(workspace);
  mkdirSync(root, { recursive: true });
  const candidate = relPath.trim() || '.';
  const abs = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`路径越出工作区：${relPath}`);
  return abs;
}

function renderTemplate(template: string, ctx: RunContext, cwd: string): string {
  const defaults: Record<string, string> = {
    workspace: ctx.workspace,
    cwd,
    path: asString(ctx.args.path),
    message: asString(ctx.args.message, 'chore: toolbox push'),
    url: asString(ctx.args.url),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key in ctx.args) return asString(ctx.args[key]);
    if (key in defaults) return defaults[key] ?? '';
    return '';
  });
}

async function runShell(command: string, cwd: string, timeoutMs: number) {
  const { stdout, stderr } = await execP(RUN.CMD_PREFIX + command, {
    cwd,
    encoding: 'buffer',
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    stdout: IO.clip(IO.decode(stdout)),
    stderr: IO.clip(IO.decode(stderr)),
    code: 0,
  };
}

async function openPath(abs: string): Promise<string> {
  if (!existsSync(abs)) throw new Error(`路径不存在：${abs}`);
  const quoted = abs.replace(/"/g, '\\"');
  try {
    if (process.platform === 'win32') {
      await execP(`explorer "${quoted}"`, { windowsHide: true });
    } else if (process.platform === 'darwin') {
      await execP(`open "${quoted}"`, { windowsHide: true });
    } else {
      await execP(`xdg-open "${quoted}"`, { windowsHide: true });
    }
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (process.platform === 'win32' && code === 1) return abs;
    throw err;
  }
  return abs;
}

async function openUrl(url: string): Promise<string> {
  const target = url.trim();
  if (!target) throw new Error('url 为空');
  const quoted = target.replace(/"/g, '\\"');
  try {
    if (process.platform === 'win32') {
      await execP(`cmd /c start "" "${quoted}"`, { windowsHide: true });
    } else if (process.platform === 'darwin') {
      await execP(`open "${quoted}"`, { windowsHide: true });
    } else {
      await execP(`xdg-open "${quoted}"`, { windowsHide: true });
    }
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (process.platform === 'win32' && code === 1) return target;
    throw err;
  }
  return target;
}

export async function runScript(script: ToolboxScriptConfig, ctx: RunContext): Promise<string> {
  const cwd = resolve(
    renderTemplate(script.cwd?.trim() || '{{workspace}}', ctx, ctx.workspace) || ctx.workspace,
  );
  mkdirSync(cwd, { recursive: true });

  if (script.kind === 'shell') {
    const command = renderTemplate(String(script.command), ctx, cwd).trim();
    if (!command) throw new Error('shell command 为空');
    const timeoutMs = Math.min(
      120_000,
      Math.max(1_000, Number.isFinite(script.timeoutMs) ? Number(script.timeoutMs) : 60_000),
    );
    try {
      const r = await runShell(command, cwd, timeoutMs);
      return JSON.stringify(r);
    } catch (err) {
      const e = err as { stdout?: Buffer; stderr?: Buffer; code?: number | null };
      return JSON.stringify({
        stdout: IO.clip(e.stdout ? IO.decode(e.stdout) : ''),
        stderr: IO.clip(e.stderr ? IO.decode(e.stderr) : String(err)),
        code: e.code ?? 1,
      });
    }
  }

  if (script.kind === 'open_path') {
    const rel = renderTemplate(String(script.path ?? '.'), ctx, cwd).trim() || '.';
    const abs = resolveInWorkspace(ctx.workspace, rel === '{{path}}' ? '.' : rel);
    const opened = await openPath(abs);
    return JSON.stringify({ ok: true, path: opened });
  }

  const url = renderTemplate(String(script.url), ctx, cwd).trim();
  const opened = await openUrl(url);
  return JSON.stringify({ ok: true, url: opened });
}

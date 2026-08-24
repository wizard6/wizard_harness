import { exec } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { promisify, TextDecoder } from 'node:util';
import { assertInside, toPosix } from './jail.js';

const execP = promisify(exec);
const MAX_WRITE = 1024 * 1024;
const MAX_READ = 512 * 1024;
const MAX_GLOB = 200;
const MAX_GREP = 80;
const MAX_BASH_CHARS = 100_000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '.turbo', 'out']);
const CMD_PREFIX = process.platform === 'win32' ? 'chcp 65001 >nul && ' : '';

function decode(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gbk').decode(buf);
  }
}

function clip(text: string, max = MAX_BASH_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…（截断，共 ${text.length} 字符）`;
}

function asString(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value);
}

function globToRegExp(glob: string): RegExp {
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
  return SKIP_DIRS.has(name);
}

function isProbablyBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function walkFiles(rootAbs: string, startAbs: string, out: string[], cap: number): void {
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

export interface WorkspaceHost {
  info(): { root: string };
  readFile(args: Record<string, unknown>): string;
  writeFile(args: Record<string, unknown>): { ok: true; path: string };
  strReplace(args: Record<string, unknown>): { ok: true; path: string; replacements: number };
  grep(args: Record<string, unknown>): {
    matches: Array<{ path: string; line: number; text: string }>;
    truncated: boolean;
  };
  glob(args: Record<string, unknown>): { paths: string[]; truncated: boolean };
  bash(args: Record<string, unknown>): Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
  }>;
}

export const DEV_TOOL_NAMES = [
  'bash',
  'read_file',
  'write_file',
  'str_replace',
  'grep',
  'glob',
] as const;

export function createWorkspaceHost(root: string): WorkspaceHost {
  const rootAbs = resolve(root);
  mkdirSync(rootAbs, { recursive: true });

  const relOf = (abs: string) => toPosix(relative(rootAbs, abs));

  return {
    info() {
      return { root: rootAbs };
    },
    readFile(args) {
      const path = asString(args.path).trim();
      if (!path) throw new Error('read_file 需要 args.path');
      const file = assertInside(rootAbs, path);
      if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`文件不存在：${path}`);
      const buf = readFileSync(file);
      if (buf.length > MAX_READ) throw new Error(`超过 ${MAX_READ} 字节读取上限`);
      if (isProbablyBinary(buf)) throw new Error(`不像文本文件：${path}`);
      const lines = buf.toString('utf8').split(/\r?\n/);
      const offsetRaw = args.offset;
      const limitRaw = args.limit;
      const offset =
        offsetRaw === undefined || offsetRaw === null ? 1 : Math.max(1, Number(offsetRaw) || 1);
      const limit =
        limitRaw === undefined || limitRaw === null
          ? lines.length
          : Math.max(0, Number(limitRaw) || 0);
      const sliced = lines.slice(offset - 1, offset - 1 + limit);
      return sliced.map((line, i) => `${String(offset + i).padStart(6, ' ')}|${line}`).join('\n');
    },
    writeFile(args) {
      const path = asString(args.path).trim();
      if (!path) throw new Error('write_file 需要 args.path');
      if (typeof args.content !== 'string') throw new Error('write_file 需要字符串 args.content');
      if (args.content.length > MAX_WRITE) throw new Error(`超过 ${MAX_WRITE} 字节写入上限`);
      const file = assertInside(rootAbs, path);
      if (file === rootAbs || file.endsWith(sep)) throw new Error('不能把根目录当文件写');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, args.content, 'utf8');
      return { ok: true, path: relOf(file) };
    },
    strReplace(args) {
      const path = asString(args.path).trim();
      const oldString = asString(args.old_string);
      if (!path) throw new Error('str_replace 需要 args.path');
      if (!oldString) throw new Error('str_replace 需要非空 args.old_string');
      if (typeof args.new_string !== 'string') throw new Error('str_replace 需要字符串 args.new_string');
      const file = assertInside(rootAbs, path);
      if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`文件不存在：${path}`);
      const text = readFileSync(file, 'utf8');
      const replaceAll = args.replace_all === true || args.replace_all === 'true';
      const hits = text.split(oldString).length - 1;
      if (hits === 0) throw new Error('old_string 未找到');
      if (!replaceAll && hits !== 1) {
        throw new Error(`old_string 出现 ${hits} 次，请写更长上下文，或设 args.replace_all=true`);
      }
      const next = replaceAll ? text.split(oldString).join(args.new_string) : text.replace(oldString, args.new_string);
      writeFileSync(file, next, 'utf8');
      return { ok: true, path: relOf(file), replacements: replaceAll ? hits : 1 };
    },
    grep(args) {
      const pattern = asString(args.pattern);
      if (!pattern) throw new Error('grep 需要 args.pattern');
      let re: RegExp;
      try {
        re = new RegExp(pattern);
      } catch {
        throw new Error(`非法正则：${pattern}`);
      }
      const start = assertInside(rootAbs, asString(args.path, '.').trim() || '.');
      const glob = asString(args.glob).trim();
      const filter = glob ? globToRegExp(glob) : undefined;
      const files: string[] = [];
      walkFiles(rootAbs, start, files, 4000);
      const matches: Array<{ path: string; line: number; text: string }> = [];
      for (const file of files) {
        if (matches.length >= MAX_GREP) break;
        const rel = relOf(file);
        if (filter && !filter.test(rel)) continue;
        let buf: Buffer;
        try {
          buf = readFileSync(file);
        } catch {
          continue;
        }
        if (buf.length > MAX_READ || isProbablyBinary(buf)) continue;
        const lines = buf.toString('utf8').split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
          if (matches.length >= MAX_GREP) break;
          if (re.test(lines[i]!)) matches.push({ path: rel, line: i + 1, text: lines[i]! });
        }
      }
      return { matches, truncated: matches.length >= MAX_GREP };
    },
    glob(args) {
      const pattern = asString(args.pattern).trim();
      if (!pattern) throw new Error('glob 需要 args.pattern');
      const filter = globToRegExp(pattern);
      const start = assertInside(rootAbs, asString(args.path, '.').trim() || '.');
      const files: string[] = [];
      walkFiles(rootAbs, start, files, 8000);
      const paths: string[] = [];
      for (const file of files) {
        const rel = relOf(file);
        if (filter.test(rel)) paths.push(rel);
        if (paths.length >= MAX_GLOB) break;
      }
      return { paths, truncated: paths.length >= MAX_GLOB };
    },
    async bash(args) {
      const command = asString(args.command).trim();
      if (!command) throw new Error('bash 需要 args.command');
      const timeoutMsRaw = Number(args.timeoutMs ?? 30_000);
      const timeoutMs = Math.min(120_000, Math.max(1_000, Number.isFinite(timeoutMsRaw) ? timeoutMsRaw : 30_000));
      try {
        const { stdout, stderr } = await execP(CMD_PREFIX + command, {
          cwd: rootAbs,
          encoding: 'buffer',
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
          windowsHide: true,
        });
        return { stdout: clip(decode(stdout)), stderr: clip(decode(stderr)), code: 0 };
      } catch (err) {
        const e = err as { stdout?: Buffer; stderr?: Buffer; code?: number | null };
        return {
          stdout: clip(e.stdout ? decode(e.stdout) : ''),
          stderr: clip(e.stderr ? decode(e.stderr) : String(err)),
          code: e.code ?? 1,
        };
      }
    },
  };
}

import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function isApiPath(pathname: string): boolean {
  return (
    pathname === '/events' ||
    pathname.startsWith('/events/') ||
    pathname === '/state' ||
    pathname === '/plugins' ||
    pathname.startsWith('/plugins/') ||
    pathname === '/services' ||
    pathname === '/rpc'
  );
}

export function mimeFor(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** 把 URL 路径落到 root 下的真实文件；越界或缺失返回 undefined */
export function resolveStaticFile(root: string, urlPath: string): string | undefined {
  if (!root.trim()) return undefined;
  const base = resolve(root);
  const trimmed = urlPath.replace(/\\/g, '/');
  const rel = decodeURIComponent(trimmed === '/' ? 'index.html' : trimmed.replace(/^\//, ''));
  const candidate = resolve(base, rel);
  const relToBase = relative(base, candidate);
  if (relToBase.startsWith('..') || relToBase.startsWith(`..${sep}`)) return undefined;
  if (normalize(relToBase) === '..') return undefined;
  if (!existsSync(candidate)) {
    if (!extname(candidate) && existsSync(join(candidate, 'index.html'))) {
      return join(candidate, 'index.html');
    }
    return undefined;
  }
  const st = statSync(candidate);
  if (st.isDirectory()) {
    const index = join(candidate, 'index.html');
    return existsSync(index) ? index : undefined;
  }
  return candidate;
}

/** /site 与 /site/* → 站点根相对路径 */
export function siteSubpath(pathname: string): string | undefined {
  if (pathname === '/site') return '/';
  if (pathname.startsWith('/site/')) {
    const rest = pathname.slice('/site'.length);
    return rest === '' ? '/' : rest;
  }
  return undefined;
}

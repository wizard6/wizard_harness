import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 托盘弹窗：把 plugins/workspace/web 装配成自包含 HTML。改外观只动 web/。 */

function resolveWebDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const dir of [join(here, '../web'), join(here, '../../web')]) {
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  throw new Error('workspace web 目录未找到');
}

export function assembleWorkspaceHtml(): string {
  const dir = resolveWebDir();
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const css = readFileSync(join(dir, 'app.css'), 'utf8');
  const js = readFileSync(join(dir, 'app.js'), 'utf8');
  const withCss = html.replace(
    /<link\s+rel="stylesheet"\s+href="\.\/app\.css"\s*\/?>/,
    `<style>${css}</style>`,
  );
  const withJs = withCss.replace(/<script\s+src="\.\/app\.js"><\/script>/, `<script>${js}</script>`);
  if (withCss === html || withJs === withCss) {
    throw new Error('workspace web 装配失败：index.html 须引用 ./app.css 与 ./app.js');
  }
  return withJs;
}

export const WORKSPACE_HTML = assembleWorkspaceHtml();

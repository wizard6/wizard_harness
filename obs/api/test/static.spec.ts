import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isApiPath, mimeFor, resolveStaticFile, siteSubpath } from '../src/static.js';

describe('obs-api 静态挂载', () => {
  it('API 路径不交给静态目录', () => {
    expect(isApiPath('/rpc')).toBe(true);
    expect(isApiPath('/events/stream')).toBe(true);
    expect(isApiPath('/')).toBe(false);
    expect(isApiPath('/site/')).toBe(false);
  });

  it('siteSubpath 剥 /site 前缀', () => {
    expect(siteSubpath('/site')).toBe('/');
    expect(siteSubpath('/site/')).toBe('/');
    expect(siteSubpath('/site/index.html')).toBe('/index.html');
    expect(siteSubpath('/other')).toBeUndefined();
  });

  it('resolveStaticFile 防穿越并回退 index.html', () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-static-'));
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'index.html'), 'ok', 'utf8');
    writeFileSync(join(root, 'sub', 'index.html'), 'sub', 'utf8');
    expect(resolveStaticFile(root, '/')?.endsWith('index.html')).toBe(true);
    expect(resolveStaticFile(root, '/sub')?.endsWith(join('sub', 'index.html'))).toBe(true);
    expect(resolveStaticFile(root, '/../secret')).toBeUndefined();
    expect(mimeFor('a.html')).toContain('text/html');
  });
});

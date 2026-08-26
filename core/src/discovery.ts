import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from './registrar/types.js';

export interface DiscoverResult {
  plugins: Plugin[];
  /** 加载失败的插件包提示（隔离，不中断整体发现） */
  warnings: string[];
}

export interface DiscoverOptions {
  /** 跳过以该前缀开头的目录（默认 "_"，如 _disabled/） */
  skipPrefix?: string;
  /** 加载插件模块的实现（默认加载 <dir>/<name>/dist/index.js；测试可注入） */
  load?: (dirName: string, distPath: string) => Promise<unknown>;
  /** 绕过 ESM 模块缓存（热重载用）：import URL 追加 ?t=<ms> */
  cacheBust?: boolean;
}

const isPluginPackage = (pkg: Record<string, unknown>): boolean =>
  (pkg as { wizardHarness?: { plugin?: boolean } }).wizardHarness?.plugin === true ||
  String(pkg.name ?? '').startsWith('@wizard-harness/plugin-');

/**
 * 扫描插件目录并加载全部插件包。
 * 约定：目录下每个子目录是一个插件包（需 package.json）；识别标记
 * `"wizardHarness": { "plugin": true }` 或包名以 `@wizard-harness/plugin-` 开头；
 * 跳过以 skipPrefix 开头的目录（默认 "_"，如 _disabled/）。
 * 每个插件按其 dist/index.js 加载（不依赖 node_modules 包名解析）。
 * 单个插件加载/校验失败只记入 warnings，不影响其它插件。
 */
export async function discoverPlugins(
  dir: string,
  opts: DiscoverOptions = {},
): Promise<DiscoverResult> {
  const skipPrefix = opts.skipPrefix ?? '_';
  let bustSeq = 0;
  const load =
    opts.load ??
    ((_name: string, distPath: string) =>
      import(
        pathToFileURL(distPath).href + (opts.cacheBust ? `?t=${Date.now()}-${++bustSeq}` : '')
      ));
  const warnings: string[] = [];
  const plugins: Plugin[] = [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return { plugins, warnings: [`插件目录不存在：${dir}`] };
  }

  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith(skipPrefix)) continue;
    const pkgPath = join(dir, ent.name, 'package.json');
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      if (!isPluginPackage(pkg)) continue;
      const distPath = join(dir, ent.name, 'dist', 'index.js');
      if (!existsSync(distPath)) {
        warnings.push(`${ent.name}：缺少 dist/index.js（请先 pnpm build）`);
        continue;
      }
      const mod = await load(ent.name, distPath);
      const plugin = (mod as { default?: Plugin }).default;
      if (!plugin || !plugin.manifest?.id || typeof plugin.register !== 'function') {
        warnings.push(`${ent.name}：不是合法插件（缺 manifest.id 或 register）`);
        continue;
      }
      const pkgTags = (pkg.wizardHarness as { tags?: unknown } | undefined)?.tags;
      if (Array.isArray(pkgTags)) {
        const declared = new Set((plugin.manifest.tags ?? []).map(String));
        for (const t of pkgTags) {
          const tag = String(t).trim();
          if (tag && !declared.has(tag)) {
            warnings.push(
              `${ent.name}：package.json wizardHarness.tags 含「${tag}」，但 manifest.tags 未声明`,
            );
          }
        }
      }
      plugins.push(plugin);
    } catch (err) {
      warnings.push(`${ent.name}：加载失败（${String(err)}）`);
    }
  }
  return { plugins, warnings };
}

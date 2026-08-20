import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { composeLayers, parsePatchList } from './patch.js';
import type { CompositionSnapshot, LoadProfileOptions, LoadedBundle, PatchOptions } from './types.js';

export const PATCH_FILENAME = 'wizard.patch.json';

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`${file}：无法读取（${String(err)}）`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(`${file}：不是合法 JSON（${String(err)}）`);
  }
}

/** optional：缺文件 = 无此层；required / 文件损坏 = 抛错 */
export function loadPatchFile(file: string, mode: 'optional' | 'required'): PatchOptions[] | undefined {
  if (!existsSync(file)) {
    if (mode === 'required') throw new Error(`${file}：patch 文件不存在`);
    return undefined;
  }
  return parsePatchList(readJson(file), file);
}

export function loadBundle(dir: string, name: string): LoadedBundle {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) throw new Error(`找不到 bundle：${name}（${dir}）`);
  const pkg = readJson(pkgPath) as Record<string, unknown>;
  const patch = (pkg.wizardHarness as { bundle?: { patch?: unknown } } | undefined)?.bundle?.patch;
  if (typeof patch !== 'string' || !patch) {
    throw new Error(`${dir}：package.json 缺少 wizardHarness.bundle.patch（不是 bundle）`);
  }
  const file = resolve(dir, patch);
  const patches = loadPatchFile(file, 'required');
  if (!patches) throw new Error(`${file}：bundle patch 为空`);
  return { name, dir, patches };
}

export function resolveBundleDir(name: string, profileDir: string, bundlesDir?: string): string {
  if (name.startsWith('.') || name.includes('/') || name.includes('\\')) {
    return resolve(profileDir, name);
  }
  const candidates = [
    bundlesDir ? join(bundlesDir, name) : '',
    join(profileDir, 'node_modules', name),
    join(profileDir, name),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(join(c, 'package.json'))) return c;
  }
  throw new Error(`找不到 bundle：${name}`);
}

/** 组合：空树 ← bundle 层（列表序）← profile patch ← home patch ← overlays */
export function loadProfile(opts: LoadProfileOptions): CompositionSnapshot {
  const { profileDir, bundlesDir, homeDir, overlays = [] } = opts;
  const pkgPath = join(profileDir, 'package.json');
  if (!existsSync(pkgPath)) throw new Error(`profile 不存在：${profileDir}`);
  const pkg = readJson(pkgPath) as Record<string, unknown>;
  const list = (pkg.wizardHarness as { profile?: { bundles?: unknown } } | undefined)?.profile?.bundles;
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) {
    throw new Error(`${profileDir}：需要 wizardHarness.profile.bundles 字符串数组`);
  }
  const bundles = list as string[];
  const layers: PatchOptions[][] = [];
  for (const name of bundles) {
    layers.push(loadBundle(resolveBundleDir(name, profileDir, bundlesDir), name).patches);
  }
  const profilePatch = loadPatchFile(join(profileDir, PATCH_FILENAME), 'optional');
  if (profilePatch) layers.push(profilePatch);
  if (homeDir) {
    const homePatch = loadPatchFile(join(homeDir, PATCH_FILENAME), 'optional');
    if (homePatch) layers.push(homePatch);
  }
  for (const extra of overlays) layers.push([...extra]);
  const { entries, warnings } = composeLayers(layers);
  const names = new Set<string>();
  for (const e of entries) {
    if (names.has(e.name)) throw new Error(`同插件出现多次（本仓库不支持多实例）：${e.name}`);
    names.add(e.name);
  }
  return {
    profile: typeof pkg.name === 'string' ? pkg.name : profileDir,
    profileDir,
    bundles,
    entries,
    warnings,
  };
}

export function resolveHomeDir(explicit?: string): string {
  return explicit || process.env.WH_HOME || join(homedir(), '.wizard-harness');
}

/** WH_PROFILE=off 关闭组合，退回目录发现。name 或路径均可。 */
export function resolveProfileDir(
  nameOrPath: string | undefined,
  cwd: string,
  homeDir?: string,
): string | undefined {
  const raw = nameOrPath?.trim();
  if (raw && ['0', 'off', 'none', 'false'].includes(raw.toLowerCase())) return undefined;
  const name = raw || 'default';
  const asPath = isAbsolute(name) || name.startsWith('.') || name.includes('/') || name.includes('\\');
  const candidates = asPath
    ? [resolve(cwd, name)]
    : [join(homeDir ?? resolveHomeDir(), 'profiles', name), join(cwd, 'profiles', name)];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'package.json'))) return dir;
  }
  if (raw) throw new Error(`找不到 profile：${name}`);
  return undefined;
}

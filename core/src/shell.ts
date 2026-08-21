import { randomUUID } from 'node:crypto';
import type { EventBus } from './events/bus.js';
import type { PluginEvent } from './events/types.js';
import { discoverPlugins } from './discovery.js';
import type { DiscoverOptions } from './discovery.js';
import { createHarness } from './harness.js';
import type { BootResult, SystemContext } from './harness.js';
import { loadProfile } from './profile/load.js';
import type { CompositionSnapshot, PatchOptions, PluginEntry } from './profile/types.js';
import type { Plugin } from './registrar/types.js';

/**
 * 运行时壳装配助手（GUI / API 两个运行时壳共用）。
 *
 * 职责链：可选 profile 组合 → createHarness → discoverPlugins →
 * 过滤（profile 树 / disabled / experimental）→ boot。
 * 观测器壳（CLI / TUI）不加载插件，不调用本函数。
 */
export interface AssembleRuntimeOptions {
  bus: EventBus;
  /** 全局配置：disabledPlugins / enableExperimental 由本函数消费；其余按插件 id 分片注入 */
  config?: Readonly<Record<string, unknown>>;
  name?: string;
  pluginsDir: string;
  discover?: DiscoverOptions;
  /** 传入则按 Cordis 组合树装配；不传则发现目录下全部插件 */
  profileDir?: string;
  bundlesDir?: string;
  homeDir?: string;
  overlays?: readonly (readonly PatchOptions[])[];
}

export interface RuntimeSkipped {
  id: string;
  reason: 'disabled' | 'experimental' | 'not-in-profile' | 'unresolved';
}

export interface AssembleRuntimeResult {
  harness: SystemContext;
  plugins: Plugin[];
  pending: BootResult['pending'];
  warnings: string[];
  skipped: RuntimeSkipped[];
  composition?: CompositionSnapshot;
}

function mergeProfileConfig(
  base: Readonly<Record<string, unknown>>,
  entries: PluginEntry[],
): Record<string, unknown> {
  const config: Record<string, unknown> = { ...base };
  const extraDisabled: string[] = [];
  for (const e of entries) {
    if (e.config) config[e.name] = e.config;
    if (e.disabled) extraDisabled.push(e.name);
  }
  if (extraDisabled.length > 0) {
    const prev = (config.disabledPlugins as string[] | undefined) ?? [];
    config.disabledPlugins = [...new Set([...prev, ...extraDisabled])];
  }
  return config;
}

function filterLoadable(
  found: Plugin[],
  config: Record<string, unknown>,
  entries: PluginEntry[] | undefined,
): { loadable: Plugin[]; skipped: RuntimeSkipped[]; missing: string[] } {
  const disabled = new Set<string>((config.disabledPlugins as string[] | undefined) ?? []);
  const enableExperimental = new Set<string>(
    (config.enableExperimental as string[] | undefined) ?? [],
  );
  const skipped: RuntimeSkipped[] = [];
  const loadable: Plugin[] = [];
  const wanted = entries ? new Map(entries.map((e) => [e.name, e])) : undefined;
  const seen = new Set<string>();

  for (const p of found) {
    const id = p.manifest.id;
    seen.add(id);
    if (wanted && !wanted.has(id)) {
      skipped.push({ id, reason: 'not-in-profile' });
      continue;
    }
    if (disabled.has(id)) {
      skipped.push({ id, reason: 'disabled' });
      continue;
    }
    if (p.manifest.tier === 'experimental' && !enableExperimental.has(id)) {
      skipped.push({ id, reason: 'experimental' });
      continue;
    }
    loadable.push(p);
  }
  const missing: string[] = [];
  if (wanted) {
    for (const e of wanted.values()) {
      if (e.disabled || seen.has(e.name)) continue;
      missing.push(e.name);
      skipped.push({ id: e.name, reason: 'unresolved' });
    }
  }
  return { loadable, skipped, missing };
}

/** 创建运行时壳：装配插件并返回 harness 与加载结果 */
export async function assembleRuntime(
  opts: AssembleRuntimeOptions,
): Promise<AssembleRuntimeResult> {
  const { bus, name = 'wizard-harness', pluginsDir } = opts;

  let composition: CompositionSnapshot | undefined;
  let config: Record<string, unknown> = { ...(opts.config ?? {}) };
  if (opts.profileDir) {
    composition = loadProfile({
      profileDir: opts.profileDir,
      bundlesDir: opts.bundlesDir,
      homeDir: opts.homeDir,
      overlays: opts.overlays,
    });
    config = mergeProfileConfig(config, composition.entries);
  }

  const harness = createHarness({ bus, config, name, pluginsDir });

  bus.subscribe((e: PluginEvent) => {
    if (e.action !== 'dep-missing' || !e.target) return;
    const deps = (e.payload as { dependencies?: string[] } | undefined)?.dependencies ?? [];
    console.warn(`[boot] ${e.target}：manifest.dependencies 未满足 → ${deps.join(', ')}`);
  });

  const { plugins: found, warnings } = await discoverPlugins(pluginsDir, opts.discover);
  const { loadable, skipped, missing } = filterLoadable(found, config, composition?.entries);
  const allWarnings = [
    ...warnings,
    ...(composition?.warnings ?? []),
    ...missing.map((id) => `组合树未解析到插件：${id}`),
  ];

  const { loaded, pending } = await harness.boot(loadable);

  const shellEvent = (action: string, target: string, payload: unknown): void => {
    bus.emit({ id: randomUUID(), ts: Date.now(), actor: 'shell', action, target, payload });
  };
  if (composition) {
    shellEvent('profile-composed', composition.profile, {
      bundles: composition.bundles,
      entries: composition.entries,
    });
  }
  for (const s of skipped) shellEvent('skipped', s.id, { reason: s.reason });
  for (const p of pending) shellEvent('inject-pending', p.plugin.manifest.id, { missing: p.missing });

  return {
    harness,
    plugins: loaded.map((r) => r.plugin),
    pending,
    warnings: allWarnings,
    skipped,
    composition,
  };
}

export interface SyncRuntimeOptions {
  harness: SystemContext;
  pluginsDir: string;
  discover?: DiscoverOptions;
  profileDir?: string;
  bundlesDir?: string;
  homeDir?: string;
  overlays?: readonly (readonly PatchOptions[])[];
}

export interface SyncRuntimeResult {
  /** 本次新 boot 成功的插件 */
  loaded: Plugin[];
  /** 已在注册表中、本轮跳过 */
  already: string[];
  pending: BootResult['pending'];
  failures: BootResult['failures'];
  skipped: RuntimeSkipped[];
  warnings: string[];
  composition?: CompositionSnapshot;
}

/**
 * 运行时再扫描：重读 profile + 插件目录，把尚未注册的可加载插件 boot 进去。
 * 不卸载已加载插件，不自动 reload。观测台/API 热发现用。
 */
export async function syncRuntime(opts: SyncRuntimeOptions): Promise<SyncRuntimeResult> {
  const { harness, pluginsDir } = opts;
  const config: Record<string, unknown> = { ...harness.config };
  let composition: CompositionSnapshot | undefined;
  if (opts.profileDir) {
    composition = loadProfile({
      profileDir: opts.profileDir,
      bundlesDir: opts.bundlesDir,
      homeDir: opts.homeDir,
      overlays: opts.overlays,
    });
    Object.assign(config, mergeProfileConfig(config, composition.entries));
  }

  const { plugins: found, warnings } = await discoverPlugins(pluginsDir, {
    cacheBust: true,
    ...opts.discover,
  });
  const { loadable, skipped, missing } = filterLoadable(found, config, composition?.entries);
  const allWarnings = [
    ...warnings,
    ...(composition?.warnings ?? []),
    ...missing.map((id) => `组合树未解析到插件：${id}`),
  ];

  const already: string[] = [];
  const newcomers: Plugin[] = [];
  for (const p of loadable) {
    if (harness.registry.has(p.manifest.id)) already.push(p.manifest.id);
    else newcomers.push(p);
  }

  const { loaded, pending, failures } = await harness.boot(newcomers);
  for (const r of loaded) {
    const row = composition?.entries.find((e) => e.name === r.plugin.manifest.id);
    if (row?.config) harness.updateConfig(r.plugin.manifest.id, row.config);
  }

  const shellEvent = (action: string, target: string, payload: unknown): void => {
    harness.emit({ id: randomUUID(), ts: Date.now(), actor: 'shell', action, target, payload });
  };
  shellEvent('scan', 'plugins', {
    loaded: loaded.map((r) => r.plugin.manifest.id),
    already,
    skipped,
    pending: pending.map((p) => p.plugin.manifest.id),
    failures: failures.map((f) => f.id),
  });
  for (const s of skipped) shellEvent('skipped', s.id, { reason: s.reason });
  for (const p of pending) shellEvent('inject-pending', p.plugin.manifest.id, { missing: p.missing });

  return {
    loaded: loaded.map((r) => r.plugin),
    already,
    pending,
    failures,
    skipped,
    warnings: allWarnings,
    composition,
  };
}

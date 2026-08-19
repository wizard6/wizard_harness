import { randomUUID } from 'node:crypto';
import type { EventBus } from './events/bus.js';
import type { PluginEvent } from './events/types.js';
import { discoverPlugins } from './discovery.js';
import type { DiscoverOptions } from './discovery.js';
import { createHarness } from './harness.js';
import type { BootResult, SystemContext } from './harness.js';
import type { Plugin } from './registrar/types.js';

/**
 * 运行时壳装配助手（GUI / API 两个运行时壳共用）。
 *
 * 职责链：createHarness → discoverPlugins → 过滤（disabled / experimental）→
 * boot（inject 拓扑装配，缺必选进 pending）→ 返回运行时快照。
 * 同时在总线侧消费 `dep-missing` 事件打印警告（骨架修复确认稿要求）。
 *
 * 观测器壳（CLI / TUI）不加载插件，不调用本函数；它们读 events.jsonl 即可看到
 * 这里发出的 register / skipped / inject-pending / dep-missing 事件。
 */
export interface AssembleRuntimeOptions {
  bus: EventBus;
  /** 全局配置：disabledPlugins / enableExperimental 由本函数消费；其余按插件 id 分片注入 */
  config?: Readonly<Record<string, unknown>>;
  name?: string;
  /** 插件包目录（传给 discoverPlugins） */
  pluginsDir: string;
  /** 透传给 discoverPlugins（测试可注入 load） */
  discover?: DiscoverOptions;
}

export interface RuntimeSkipped {
  id: string;
  reason: 'disabled' | 'experimental';
}

export interface AssembleRuntimeResult {
  harness: SystemContext;
  /** 已加载的插件（boot 成功后） */
  plugins: Plugin[];
  /** 因缺必选 inject 而未加载的插件 */
  pending: BootResult['pending'];
  /** discover 阶段的加载/校验告警（单插件失败不中断整体） */
  warnings: string[];
  /** 被壳过滤跳过的插件 */
  skipped: RuntimeSkipped[];
}

/** 创建运行时壳：装配插件并返回 harness 与加载结果 */
export async function assembleRuntime(
  opts: AssembleRuntimeOptions,
): Promise<AssembleRuntimeResult> {
  const { bus, config = {}, name = 'wizard-harness', pluginsDir } = opts;

  const harness = createHarness({ bus, config, name });

  // dep-missing 警告落地（骨架修复确认稿第 3 条）：register 阶段 emit，壳侧转可读警告
  bus.subscribe((e: PluginEvent) => {
    if (e.action !== 'dep-missing' || !e.target) return;
    const deps = (e.payload as { dependencies?: string[] } | undefined)?.dependencies ?? [];
    console.warn(`[boot] ${e.target}：manifest.dependencies 未满足 → ${deps.join(', ')}`);
  });

  const { plugins: found, warnings } = await discoverPlugins(pluginsDir, opts.discover);

  const disabled = new Set<string>((config.disabledPlugins as string[] | undefined) ?? []);
  const enableExperimental = new Set<string>(
    (config.enableExperimental as string[] | undefined) ?? [],
  );

  const skipped: RuntimeSkipped[] = [];
  const loadable: Plugin[] = [];
  for (const p of found) {
    if (disabled.has(p.manifest.id)) {
      skipped.push({ id: p.manifest.id, reason: 'disabled' });
      continue;
    }
    if (p.manifest.tier === 'experimental' && !enableExperimental.has(p.manifest.id)) {
      skipped.push({ id: p.manifest.id, reason: 'experimental' });
      continue;
    }
    loadable.push(p);
  }

  const { loaded, pending } = await harness.boot(loadable);

  // 可观测：跳过的插件与 pending 插件都上事件总线（jsonl 落盘，观测器壳可见）
  const shellEvent = (action: string, target: string, payload: unknown): void => {
    bus.emit({ id: randomUUID(), ts: Date.now(), actor: 'shell', action, target, payload });
  };
  for (const s of skipped) shellEvent('skipped', s.id, { reason: s.reason });
  for (const p of pending) shellEvent('inject-pending', p.plugin.manifest.id, { missing: p.missing });

  return {
    harness,
    plugins: loaded.map((r) => r.plugin),
    pending,
    warnings,
    skipped,
  };
}

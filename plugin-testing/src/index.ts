import { createEventBus, createHarness } from '@wizard-harness/core';
import type { CreateHarnessOptions, Plugin, SystemContext } from '@wizard-harness/core';
import type { EventBus } from '@wizard-harness/core';

export interface TestHarnessOptions extends Omit<CreateHarnessOptions, 'bus'> {
  bus?: EventBus;
  plugins?: Plugin[];
}

/** 测试用 harness：可选一次性 boot 插件列表 */
export async function bootTestHarness(opts: TestHarnessOptions = {}): Promise<{
  bus: EventBus;
  harness: SystemContext;
}> {
  const bus = opts.bus ?? createEventBus();
  const harness = createHarness({ ...opts, bus, name: opts.name ?? 'test' });
  if (opts.plugins?.length) await harness.boot(opts.plugins);
  return { bus, harness };
}

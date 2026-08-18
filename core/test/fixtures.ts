import type { Plugin, PluginContext } from '../src/index.js';

export interface TrackedPlugin {
  plugin: Plugin;
  /** register / start / stop 的调用顺序 */
  calls: string[];
}

/** 生成一个可追踪生命周期钩子调用顺序的测试插件 */
export function makeTrackedPlugin(overrides?: Partial<Plugin>): TrackedPlugin {
  const calls: string[] = [];
  const plugin: Plugin = {
    manifest: { id: 'demo', version: '1.0.0' },
    async register() {
      calls.push('register');
    },
    async onStart() {
      calls.push('start');
    },
    async onStop() {
      calls.push('stop');
    },
    ...overrides,
  };
  return { plugin, calls };
}

/** 生成一个在 register 阶段通过 ctx.emit 发事件的插件 */
export function makeEmittingPlugin(
  manifest: Plugin['manifest'],
  register?: (ctx: PluginContext) => void,
): Plugin {
  return {
    manifest,
    register(ctx) {
      if (register) register(ctx);
    },
  };
}

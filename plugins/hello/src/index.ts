import type { Plugin } from '@wizard-harness/core';

/**
 * hello 插件：最小真实插件包。
 * 演示：manifest 声明（输入/输出/副作用）→ register 发观测事件 → 收敛对外 api → 轻量弹窗 ui。
 */
const helloPlugin: Plugin = {
  manifest: {
    id: 'hello',
    version: '0.1.0',
    name: 'Hello 插件',
    description: '最小真实插件示例',
  },
  register(ctx) {
    ctx.emit({ action: 'hello', target: 'world', payload: { from: 'plugin:hello' } });
  },
  onStart(ctx) {
    ctx.emit({ action: 'start', target: 'hello' });
  },
  onStop(ctx) {
    ctx.emit({ action: 'stop', target: 'hello' });
  },
  api: {
    greet(name = 'world'): string {
      return `hello, ${name}!`;
    },
  },
  ui: {
    title: 'Hello 插件',
    width: 360,
    height: 240,
    content: '<h2>Hello 插件</h2><p>由 plugins/hello 真实加载，不再是内联 demo。</p>',
  },
};

export default helloPlugin;

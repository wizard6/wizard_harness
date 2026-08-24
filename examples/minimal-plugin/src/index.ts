import type { Plugin } from '@wizard-harness/plugin-sdk';

/** 外部插件最小示例：只依赖 plugin-sdk，不引用仓内 plugins/* */
const plugin: Plugin = {
  manifest: {
    id: 'example-minimal',
    version: '0.1.0',
    name: 'Minimal Example',
    provides: ['exampleMinimal'],
  },
  register(ctx) {
    ctx.emit({ action: 'register', target: 'example-minimal' });
  },
  api: {
    ping(): string {
      return 'pong';
    },
  },
};

export default plugin;

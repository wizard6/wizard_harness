import { describe, expect, it } from 'vitest';
import type { PluginEvent } from '@wizard-harness/core';
import { registrySpec } from '../src/spec.js';

function ev(action: string): PluginEvent {
  return { id: Math.random().toString(36).slice(2), ts: 1, actor: 'a', action };
}

describe('registrySpec', () => {
  it('summarize 显示 register−unregister 净额', () => {
    const events = [ev('register'), ev('register'), ev('unregister')];
    expect(registrySpec.summarize?.(events)).toBe('当前 1（注册 2 / 注销 1 / 事件 3）');
  });

  it('renderEvent 输出 actor → action target', () => {
    expect(registrySpec.renderEvent?.(ev('register'))).toBe('a → register');
  });
});

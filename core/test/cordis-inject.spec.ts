import { describe, expect, it } from 'vitest';
import type { PluginContext } from '../src/index.js';
import { cordisInjectView } from '../src/registrar/cordis-inject.js';

describe('cordisInjectView', () => {
  it('tools 对消费方默认登记绑定 owner ctx', () => {
    const owner = { id: 'persona' } as unknown as PluginContext;
    const tools = {
      bind(o: PluginContext) {
        return { bound: o === owner, register() {} };
      },
      listIn() {
        return [];
      },
    };
    const wrapped = cordisInjectView('tools', tools, owner, 'persona') as {
      bind: (o: PluginContext) => { bound: boolean };
    };
    expect(wrapped.bind(owner).bound).toBe(true);
    expect(cordisInjectView('tools', tools, owner, 'tools')).toBe(tools);
  });

  it('tools 保留 bind 供 agent scope 二次绑定', () => {
    const owner = { id: 'agent-loop' } as unknown as PluginContext;
    const agentCtx = { id: 'agent-scope' } as unknown as PluginContext;
    const tools = {
      bind(o: PluginContext) {
        return { scope: o, register() {} };
      },
      listIn() {
        return [];
      },
    };
    const wrapped = cordisInjectView('tools', tools, owner, 'agent-loop') as {
      bind: (o: PluginContext) => { scope: PluginContext };
    };
    expect(wrapped.bind(agentCtx).scope).toBe(agentCtx);
  });

  it('其它服务原样返回', () => {
    const session = { start: () => ({}) };
    expect(cordisInjectView('session', session, {} as PluginContext, 'x')).toBe(session);
  });
});

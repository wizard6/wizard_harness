import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness, scopeOf } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { AGENT_LOOP_SERVICE, QUERY_LOOP_SERVICE } from '@wizard-harness/contracts';
import type {
  AgentLoopService,
  AgentService,
  PromptContextService,
  QueryLoopService,
  SessionService,
  ToolsService,
} from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import llmPlugin from '../../llm/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import agentPlugin from '../../agent/src/index.js';
import queryLoopPlugin from '../src/index.js';
import { parseToolCall } from '../src/intents.js';

describe('query-loop intents', () => {
  it('解析 echo 与 tool json', () => {
    expect(parseToolCall('[mock] echo hi')).toEqual({ name: 'echo', args: { input: 'hi' } });
    expect(parseToolCall('tool echo {"input":"z"}')).toEqual({ name: 'echo', args: { input: 'z' } });
    expect(parseToolCall('[mock] hello')).toBeUndefined();
  });
});

describe('query-loop 插件', () => {
  it('同时提供 agentLoop 与 queryLoop', () => {
    expect(AGENT_LOOP_SERVICE).toBe('agentLoop');
    expect(QUERY_LOOP_SERVICE).toBe('queryLoop');
    expect(queryLoopPlugin.manifest.provides).toEqual(['agentLoop', 'queryLoop']);
    expect(queryLoopPlugin.inject).toEqual({
      agent: true,
      llm: true,
      tools: true,
      promptContext: true,
      logger: false,
      trajectory: false,
    });
  });

  it('缺 promptContext 时 boot 挂起', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const result = await harness.boot([sessionPlugin, llmPlugin, toolsPlugin, agentPlugin, queryLoopPlugin]);
    expect(result.pending.some((p) => p.plugin === queryLoopPlugin && p.missing.includes('promptContext'))).toBe(true);
    expect(harness.services.get<AgentLoopService>('agentLoop')).toBeUndefined();
  });

  async function boot() {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(llmPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(toolsPlugin);
    await harness.registry.register(agentPlugin);
    await harness.registry.register(queryLoopPlugin);
    return {
      seen,
      loop: harness.services.get<AgentLoopService>('agentLoop')!,
      query: harness.services.get<QueryLoopService>('queryLoop')!,
      agent: harness.services.get<AgentService>('agent')!,
      session: harness.services.get<SessionService>('session')!,
      prompts: harness.services.get<PromptContextService>('promptContext')!,
      tools: harness.services.get<ToolsService>('tools')!,
    };
  }

  it('无工具：一次 complete；兼容 agent-loop 事件名', async () => {
    const { loop, agent, session, prompts, seen } = await boot();
    const h = agent.spawn({ id: 't' });
    prompts.setPersona(h.sessionId, 'you are a tester');
    const out = await loop.run({ agentId: 't', prompt: 'hello' });
    expect(out.steps).toBe(1);
    expect(out.text).toBe('[mock] hello');
    expect(session.get(out.sessionId)!.replay()[0]?.data.content).toBe('you are a tester');
    expect(seen.some((e) => e.action === 'agent-loop/start')).toBe(true);
    expect(seen.some((e) => e.action === 'query-loop/start')).toBe(true);
    expect(seen.some((e) => e.action === 'agent-loop/observe')).toBe(true);
    expect(seen.some((e) => e.action === 'agent-loop/think')).toBe(true);
  });

  it('echo 协议：model→tools→model→end_turn', async () => {
    const { loop, session, seen } = await boot();
    const out = await loop.run({ prompt: 'echo hi', maxSteps: 4 });
    expect(out.steps).toBe(2);
    expect(out.text).toBe('[mock] [echo] hi');
    expect(seen.some((e) => e.action === 'agent-loop/act')).toBe(true);
    expect(session.get(out.sessionId)!.replay().some((e) => e.kind === 'tool-result' && e.data.content === 'hi')).toBe(
      true,
    );
  });

  it('after-model hook 可 skip-tools 提前结束', async () => {
    const { query, session } = await boot();
    query.use({
      name: 'no-tools',
      stages: ['after-model'],
      run: () => ({ action: 'skip-tools' }),
    });
    const out = await query.run({ prompt: 'echo hi', maxSteps: 4 });
    expect(out.steps).toBe(1);
    expect(session.get(out.sessionId)!.replay().some((e) => e.kind === 'tool-result')).toBe(false);
  });

  it('scoped overlay 遮盖全局同名工具', async () => {
    const { loop, agent, session, tools, prompts } = await boot();
    const h = agent.spawn({ id: 'shadow' });
    tools.bind(h.ctx).register({
      name: 'echo',
      description: 'scoped echo',
      handler: () => 'scoped-echo',
    });
    const asm = prompts.assemble({ sessionId: h.sessionId, scope: scopeOf(h.ctx) });
    expect(asm.tools.find((t) => t.name === 'echo')?.description).toBe('scoped echo');
    const out = await loop.run({ agentId: 'shadow', prompt: 'echo hi', maxSteps: 2 });
    const tool = session.get(out.sessionId)!.replay().find((e) => e.kind === 'tool-result' && e.data.name === 'echo');
    expect(tool?.data.content).toBe('scoped-echo');
  });
});

import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness, scopeOf } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { AGENT_LOOP_SERVICE } from '@wizard-harness/contracts';
import type {
  AgentLoopService,
  AgentService,
  PromptContextService,
  SessionService,
  ToolsService,
} from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import llmPlugin from '../../llm/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import agentPlugin from '../../agent/src/index.js';
import agentLoopPlugin from '../src/index.js';
import { parseToolCall } from '../src/intents.js';

describe('parseToolCall', () => {
  it('解析 echo 与 mock 前缀；[echo] 结果不再命中', () => {
    expect(parseToolCall('[mock] echo hi')).toEqual({ name: 'echo', args: { input: 'hi' } });
    expect(parseToolCall('tool echo {"input":"z"}')).toEqual({ name: 'echo', args: { input: 'z' } });
    expect(parseToolCall('[mock] [echo] hi')).toBeUndefined();
    expect(parseToolCall('[mock] hello')).toBeUndefined();
  });
});

describe('agent-loop 插件', () => {
  it('服务名契约绑定 + inject agent/llm/tools/promptContext', () => {
    expect(AGENT_LOOP_SERVICE).toBe('agentLoop');
    expect(agentLoopPlugin.manifest.provides).toEqual(['agentLoop']);
    expect(agentLoopPlugin.inject).toEqual({
      agent: true,
      llm: true,
      tools: true,
      promptContext: true,
      logger: false,
      trajectory: false,
    });
  });

  it('缺 promptContext 时 boot 挂起 agent-loop', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const result = await harness.boot([
      sessionPlugin,
      llmPlugin,
      toolsPlugin,
      agentPlugin,
      agentLoopPlugin,
    ]);
    expect(result.pending).toEqual([
      { plugin: toolsPlugin, missing: ['promptContext'] },
      { plugin: agentLoopPlugin, missing: ['promptContext'] },
    ]);
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
    await harness.registry.register(agentLoopPlugin);
    return {
      seen,
      loop: harness.services.get<AgentLoopService>('agentLoop')!,
      agent: harness.services.get<AgentService>('agent')!,
      session: harness.services.get<SessionService>('session')!,
      prompts: harness.services.get<PromptContextService>('promptContext')!,
      tools: harness.services.get<ToolsService>('tools')!,
    };
  }

  it('无工具：一次 complete；run 前 setPersona 会被 apply', async () => {
    const { loop, agent, session, prompts, seen } = await boot();
    const h = agent.spawn({ id: 't' });
    prompts.setPersona(h.sessionId, 'you are a tester');
    const out = await loop.run({ agentId: 't', prompt: 'hello' });
    expect(out.steps).toBe(1);
    expect(out.text).toBe('[mock] hello');
    const kinds = session.get(out.sessionId)!.replay().map((e) => `${e.kind}:${e.data.role ?? e.data.phase}`);
    expect(kinds[0]).toBe('message:system');
    expect(session.get(out.sessionId)!.replay()[0]?.data.content).toBe('you are a tester');
    expect(kinds).toContain('message:user');
    expect(kinds).toContain('message:assistant');
    expect(seen.some((e) => e.action === 'agent-loop/start' && e.target === out.agentId)).toBe(true);
    expect(seen.some((e) => e.action === 'agent-loop/observe')).toBe(true);
    expect(seen.some((e) => e.action === 'agent-loop/think')).toBe(true);
    expect(seen.some((e) => e.action === 'agent-loop/done')).toBe(true);
    expect(seen.some((e) => e.action === 'agent/prompt')).toBe(false);
  });

  it('echo 协议：OTA 两轮 — think→act→think→完成', async () => {
    const { loop, session, seen } = await boot();
    const out = await loop.run({ prompt: 'echo hi', maxSteps: 4 });
    expect(out.steps).toBe(2);
    expect(out.text).toBe('[mock] [echo] hi');
    expect(seen.some((e) => e.action === 'agent-loop/act')).toBe(true);
    const replay = session.get(out.sessionId)!.replay();
    expect(replay.some((e) => e.kind === 'tool-result' && e.data.name === 'echo' && e.data.content === 'hi')).toBe(
      true,
    );
  });

  it('已有 agent：run 复用 session；未知 agent 抛错', async () => {
    const { loop, agent } = await boot();
    const h = agent.spawn({ id: 'keep' });
    const out = await loop.run({ agentId: 'keep', prompt: 'ping' });
    expect(out.agentId).toBe('keep');
    expect(out.sessionId).toBe(h.sessionId);
    expect(out.text).toBe('[mock] ping');
    await expect(loop.run({ agentId: 'nope', prompt: 'x' })).rejects.toThrow(/不存在/);
  });

  it('useTools:false 时 echo hi 不再调工具', async () => {
    const { loop, session } = await boot();
    const out = await loop.run({ prompt: 'echo hi', useTools: false, maxSteps: 4 });
    expect(out.steps).toBe(1);
    expect(session.get(out.sessionId)!.replay().some((e) => e.kind === 'tool-result')).toBe(false);
  });

  it('cancel 空闲无副作用；人设只经 prompt-context section/apply', async () => {
    const { loop, session, prompts } = await boot();
    loop.cancel('nobody');
    prompts.section({ name: 'brief', order: 0, text: 'be brief' });
    const out = await loop.run({ prompt: 'hello' });
    expect(session.get(out.sessionId)!.replay()[0]?.data.content).toBe('be brief');
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

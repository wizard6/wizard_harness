import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { AGENT_LOOP_SERVICE } from '@wizard-harness/contracts';
import type {
  AgentLoopService,
  AgentService,
  SessionService,
  SystemPromptService,
} from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import llmPlugin from '../../llm/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import systemPromptPlugin from '../../system-prompt/src/index.js';
import agentPlugin from '../../agent/src/index.js';
import agentLoopPlugin from '../src/index.js';
import { parseToolCall } from '../src/loop.js';

describe('parseToolCall', () => {
  it('解析 echo 与 mock 前缀；[echo] 结果不再命中', () => {
    expect(parseToolCall('[mock] echo hi')).toEqual({ name: 'echo', args: { input: 'hi' } });
    expect(parseToolCall('tool echo {"input":"z"}')).toEqual({ name: 'echo', args: { input: 'z' } });
    expect(parseToolCall('[mock] [echo] hi')).toBeUndefined();
    expect(parseToolCall('[mock] hello')).toBeUndefined();
  });
});

describe('agent-loop 插件', () => {
  it('服务名契约绑定 + inject agent/llm/tools；systemPrompt 可选', () => {
    expect(AGENT_LOOP_SERVICE).toBe('agentLoop');
    expect(agentLoopPlugin.manifest.provides).toEqual(['agentLoop']);
    expect(agentLoopPlugin.inject).toEqual({
      agent: true,
      llm: true,
      tools: true,
      systemPrompt: false,
      logger: false,
    });
  });

  async function boot() {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(llmPlugin);
    await harness.registry.register(toolsPlugin);
    await harness.registry.register(systemPromptPlugin);
    await harness.registry.register(agentPlugin);
    await harness.registry.register(agentLoopPlugin);
    return {
      seen,
      loop: harness.services.get<AgentLoopService>('agentLoop')!,
      agent: harness.services.get<AgentService>('agent')!,
      session: harness.services.get<SessionService>('session')!,
      prompts: harness.services.get<SystemPromptService>('systemPrompt')!,
    };
  }

  it('无工具：一次 complete；run 前 set 的 prompt 会被 apply', async () => {
    const { loop, agent, session, prompts, seen } = await boot();
    const h = agent.spawn({ id: 't' });
    prompts.set(h.sessionId, 'you are a tester');
    const out = await loop.run({ agentId: 't', prompt: 'hello' });
    expect(out.steps).toBe(1);
    expect(out.text).toBe('[mock] hello');
    const kinds = session.get(out.sessionId)!.replay().map((e) => `${e.kind}:${e.data.role ?? e.data.phase}`);
    expect(kinds[0]).toBe('message:system');
    expect(session.get(out.sessionId)!.replay()[0]?.data.content).toBe('you are a tester');
    expect(kinds).toContain('message:user');
    expect(kinds).toContain('message:assistant');
    expect(seen.some((e) => e.action === 'agent-loop/start' && e.target === out.agentId)).toBe(true);
    expect(seen.some((e) => e.action === 'system-prompt/apply')).toBe(true);
    expect(seen.some((e) => e.action === 'agent/prompt')).toBe(false);
  });

  it('echo 协议：complete → tools.call → 再 complete', async () => {
    const { loop, session } = await boot();
    const out = await loop.run({ prompt: 'echo hi', maxSteps: 4 });
    expect(out.steps).toBe(2);
    expect(out.text).toBe('[mock] [echo] hi');
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

  it('run.systemPrompt 转交给 system-prompt；cancel 空闲无副作用', async () => {
    const { loop, session } = await boot();
    loop.cancel('nobody');
    const out = await loop.run({ prompt: 'hello', systemPrompt: 'be brief' });
    expect(session.get(out.sessionId)!.replay()[0]?.data.content).toBe('be brief');
  });
});

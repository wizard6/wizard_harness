import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPOSE, methodAllowed, parseExpose } from '../src/expose.js';

describe('RPC 白名单', () => {
  it('未设置 WH_EXPOSE 时用默认 agent 试跑名单', () => {
    expect(parseExpose(undefined)).toEqual(DEFAULT_EXPOSE);
    expect(methodAllowed(DEFAULT_EXPOSE, 'agentLoop', 'run')).toBe(true);
    expect(methodAllowed(DEFAULT_EXPOSE, 'console', 'exec')).toBe(false);
    expect(methodAllowed(DEFAULT_EXPOSE, 'tools', 'call')).toBe(false);
  });

  it('off 或 {} 关闭全部；JSON 覆盖默认', () => {
    expect(parseExpose('off')).toEqual({});
    expect(parseExpose('{"llm":["complete"]}')).toEqual({ llm: ['complete'] });
  });
});

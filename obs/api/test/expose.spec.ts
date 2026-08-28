import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPOSE, WEB_DEV_EXPOSE, methodAllowed, parseExpose } from '../src/expose.js';

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

  it('web-dev 白名单含 workflow / webPipeline，不含 tools.call', () => {
    expect(methodAllowed(WEB_DEV_EXPOSE, 'workflow', 'run')).toBe(true);
    expect(methodAllowed(WEB_DEV_EXPOSE, 'webPipeline', 'runPipeline')).toBe(true);
    expect(methodAllowed(WEB_DEV_EXPOSE, 'tools', 'call')).toBe(false);
    expect(methodAllowed(WEB_DEV_EXPOSE, 'console', 'exec')).toBe(false);
  });
});

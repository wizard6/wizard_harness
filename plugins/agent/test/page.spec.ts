import { describe, expect, it } from 'vitest';
import { AGENT_HTML } from '../src/page.js';

describe('agent page', () => {
  it('弹窗经 ui.rpc agent.list 刷新 live 实例', () => {
    expect(AGENT_HTML).toContain('wh.call("agent","list"');
    expect(AGENT_HTML).toContain('session ');
  });
});

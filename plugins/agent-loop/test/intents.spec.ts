import { describe, expect, it } from 'vitest';
import { intentsFromThink, isTaskDone, parseToolCall } from '../src/intents.js';

describe('agent-loop intents', () => {
  it('parseToolCall 解析 echo 与 tool 协议', () => {
    expect(parseToolCall('echo hi')).toEqual({ name: 'echo', args: { input: 'hi' } });
    expect(parseToolCall('tool echo {"input":"z"}')).toEqual({ name: 'echo', args: { input: 'z' } });
  });

  it('intentsFromThink：有 tool_calls 或文本协议；无工具模式恒为空', () => {
    expect(
      intentsFromThink('', [{ id: '1', name: 'echo', args: { input: 'a' } }], true),
    ).toHaveLength(1);
    expect(intentsFromThink('echo hi', undefined, true)).toHaveLength(1);
    expect(intentsFromThink('echo hi', undefined, false)).toEqual([]);
    expect(isTaskDone([])).toBe(true);
  });
});

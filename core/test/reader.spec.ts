import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PluginEvent } from '../src/index.js';
import { queryEvents, readEvents, tailEvents } from '../src/index.js';

function makeEvent(overrides: Partial<PluginEvent>): PluginEvent {
  return {
    id: 'e',
    ts: Date.now(),
    actor: 'core.registrar',
    action: 'register',
    ...overrides,
  };
}

describe('events reader', () => {
  it('readEvents 读取 JSONL 并忽略空行', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-r-'));
    const file = join(dir, 'events.jsonl');
    writeFileSync(
      file,
      JSON.stringify(makeEvent({ id: '1' })) + '\n\n' + JSON.stringify(makeEvent({ id: '2' })) + '\n',
      'utf8',
    );
    const events = readEvents(file);
    expect(events).toHaveLength(2);
  });

  it('queryEvents 按 actor/action/keyword 过滤并支持 limit', () => {
    const events = [
      makeEvent({ id: '1', actor: 'a', action: 'register', target: 'p1' }),
      makeEvent({ id: '2', actor: 'b', action: 'start', target: 'p2', payload: { v: 1 } }),
      makeEvent({ id: '3', actor: 'a', action: 'unregister', target: 'p1' }),
    ];
    expect(queryEvents(events, { actor: 'a' }).map((e) => e.id)).toEqual(['1', '3']);
    expect(queryEvents(events, { action: 'start' }).map((e) => e.id)).toEqual(['2']);
    expect(queryEvents(events, { keyword: 'unregister' }).map((e) => e.id)).toEqual(['3']);
    expect(queryEvents(events, { limit: 2 }).map((e) => e.id)).toEqual(['2', '3']);
  });

  it('tailEvents 能收到后续追加的事件', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-t-'));
    const file = join(dir, 'events.jsonl');
    writeFileSync(file, JSON.stringify(makeEvent({ id: '1' })) + '\n', 'utf8');
    const seen: PluginEvent[] = [];
    const stop = tailEvents(file, (e) => seen.push(e), { intervalMs: 20 });
    await new Promise((r) => setTimeout(r, 40));
    appendFileSync(file, JSON.stringify(makeEvent({ id: '2' })) + '\n', 'utf8');
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(seen.map((e) => e.id)).toContain('1');
    expect(seen.map((e) => e.id)).toContain('2');
  });
});

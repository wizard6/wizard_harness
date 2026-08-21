import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { EVENTS_SERVICE } from '@wizard-harness/contracts';
import type { EventsService } from '@wizard-harness/contracts';
import eventsPlugin from '../src/index.js';

describe('events 插件', () => {
  it('服务名契约 + clear 清空内存历史', async () => {
    expect(EVENTS_SERVICE).toBe('events');
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(eventsPlugin);
    const svc = harness.services.get<EventsService>('events');
    const ctx = harness.pluginContext('events');
    expect(svc).toBeDefined();
    ctx?.emit({ action: 'ping', target: 'test' });
    expect(svc!.count()).toBeGreaterThan(0);
    expect(svc!.history().some((e) => e.action === 'ping')).toBe(true);
    svc!.clear();
    expect(svc!.count()).toBe(0);
    expect(svc!.history()).toEqual([]);
    ctx?.emit({ action: 'pong' });
    expect(svc!.history().map((e) => e.action)).toContain('pong');
    expect(svc!.history().some((e) => e.action === 'ping')).toBe(false);
  });
});

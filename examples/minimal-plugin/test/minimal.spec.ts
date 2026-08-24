import { describe, expect, it } from 'vitest';
import { bootTestHarness } from '@wizard-harness/plugin-testing';
import minimalPlugin from '../src/index.js';

describe('example-minimal-plugin', () => {
  it('sdk + testing 可 boot 并调用 api', async () => {
    const { harness } = await bootTestHarness({ plugins: [minimalPlugin] });
    expect(harness.registry.has('example-minimal')).toBe(true);
    const api = harness.services.get<{ ping(): string }>('exampleMinimal')!;
    expect(api.ping()).toBe('pong');
  });
});

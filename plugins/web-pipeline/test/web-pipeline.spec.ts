import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { WEB_PIPELINE_SERVICE } from '@wizard-harness/contracts';
import type { WebPipelineService } from '@wizard-harness/contracts';
import workflowPlugin from '../../workflow/src/index.js';
import webPipelinePlugin from '../src/index.js';
import { copySite } from '../src/copy.js';
import { shouldBuildNitron } from '../src/nitron.js';
import { pipelineGraph } from '../src/nodes.js';

function writeSite(dir: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>demo</title>', 'utf8');
  writeFileSync(join(dir, 'nitron.config.json'), '{"name":"demo","entry":"index.html"}', 'utf8');
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'skip.js'), 'no', 'utf8');
}

describe('web-pipeline 插件', () => {
  it('服务名 + 必选 workflow + 无窗口', () => {
    expect(WEB_PIPELINE_SERVICE).toBe('webPipeline');
    expect(webPipelinePlugin.manifest.provides).toEqual(['webPipeline']);
    expect(webPipelinePlugin.inject).toEqual({ workflow: true, logger: false });
    expect(webPipelinePlugin.ui).toBeUndefined();
    expect(pipelineGraph().nodes.map((n) => n.kind)).toEqual([
      'web.validate',
      'web.deploy',
      'nitron.package',
    ]);
  });

  it('shouldBuildNitron：默认 dry-run', () => {
    expect(shouldBuildNitron(undefined, {})).toBe(false);
    expect(shouldBuildNitron(true, {})).toBe(true);
    expect(shouldBuildNitron(undefined, { WH_NITRON: '1' })).toBe(true);
  });

  it('copySite 跳过 node_modules', () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-web-copy-'));
    const src = join(root, 'src');
    const dest = join(root, 'dest');
    writeSite(src);
    const files = copySite(src, dest);
    expect(files).toContain('index.html');
    expect(files).toContain('nitron.config.json');
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(existsSync(join(dest, 'node_modules'))).toBe(false);
  });

  it('按 pipelineGraph 校验并部署，nitron 默认 dry-run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-web-pipe-'));
    const source = join(root, 'src');
    const deployDir = join(root, 'deploy');
    writeSite(source);

    const harness = createHarness({
      bus: createEventBus(),
      config: { 'web-pipeline': { sourceDir: source, deployDir } },
    });
    await harness.registry.register(workflowPlugin);
    await harness.registry.register(webPipelinePlugin);
    const pipe = harness.services.get<WebPipelineService>('webPipeline')!;
    expect(pipe.kinds().map((k) => k.kind)).toEqual([
      'web.validate',
      'web.deploy',
      'nitron.package',
    ]);

    const run = await pipe.runPipeline({ runNitron: false });
    expect(run.status).toBe('ok');
    expect(run.nodes).toHaveLength(3);
    expect(run.nodes[1]?.outputs.url).toBe('/site/');
    expect(run.nodes[2]?.outputs.mode).toBe('dry-run');
    expect(String(run.nodes[2]?.outputs.command)).toContain('nitron build');
    expect(existsSync(join(deployDir, 'index.html'))).toBe(true);
  });
});

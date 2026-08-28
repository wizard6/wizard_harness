import { resolve } from 'node:path';
import { homedir } from 'node:os';
import type { WebPipelineInspect, WebPipelinePaths } from '@wizard-harness/contracts';
import { kinds, pipelineGraph } from './nodes.js';

export interface PipelineHost {
  configure(opts: { sourceDir?: string; deployDir?: string; cwd?: string }): void;
  markDeployed(): void;
  pipelineGraph: typeof pipelineGraph;
  kinds: typeof kinds;
  inspect(): WebPipelineInspect;
  paths(): WebPipelinePaths;
}

function defaultHome(): string {
  return process.env.WH_HOME?.trim() || resolve(homedir(), '.wizard-harness');
}

export function createPipelineHost(): PipelineHost {
  let sourceDir = resolve(process.cwd(), 'examples/nitron-web');
  let deployDir = resolve(defaultHome(), 'web-deploy');
  let lastDeployAt: number | undefined;

  const paths = (): WebPipelinePaths => ({
    sourceDir,
    deployDir,
    sitePath: '/site/',
  });

  return {
    configure(opts) {
      const cwd = opts.cwd ?? process.cwd();
      if (opts.sourceDir?.trim()) sourceDir = resolve(cwd, opts.sourceDir.trim());
      if (opts.deployDir?.trim()) deployDir = resolve(cwd, opts.deployDir.trim());
    },
    markDeployed() {
      lastDeployAt = Date.now();
    },
    pipelineGraph,
    kinds,
    paths,
    inspect(): WebPipelineInspect {
      const flag = String(process.env.WH_NITRON ?? '').trim();
      const nitronDefault = flag === '1' || flag.toLowerCase() === 'true' ? 'build' : 'dry-run';
      return { paths: paths(), nitronDefault, lastDeployAt };
    },
  };
}

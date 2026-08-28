import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorkflowGraph, WorkflowNodeHandler, WorkflowNodeKindInfo } from '@wizard-harness/contracts';
import { copySite, listSiteFiles } from './copy.js';
import {
  findApk,
  NITRON_COMMAND,
  nitronConfigPath,
  runNitronBuild,
  shouldBuildNitron,
} from './nitron.js';
import type { PipelineHost } from './host.js';

export const NODE_KINDS: readonly WorkflowNodeKindInfo[] = [
  { kind: 'web.validate', inputs: ['source'], outputs: ['sourceDir', 'files', 'ok'] },
  { kind: 'web.deploy', inputs: ['sourceDir', 'deployDir'], outputs: ['deployDir', 'url', 'files'] },
  { kind: 'nitron.package', inputs: ['deployDir', 'runNitron'], outputs: ['mode', 'command', 'apk', 'log'] },
];

export function kinds(): readonly WorkflowNodeKindInfo[] {
  return NODE_KINDS;
}

export function pipelineGraph(): WorkflowGraph {
  return {
    id: 'web-dev-pipeline',
    nodes: [
      { id: 'validate', kind: 'web.validate' },
      {
        id: 'deploy',
        kind: 'web.deploy',
        in: {
          sourceDir: { from: 'node', node: 'validate', key: 'sourceDir' },
        },
      },
      {
        id: 'nitron',
        kind: 'nitron.package',
        in: {
          deployDir: { from: 'node', node: 'deploy', key: 'deployDir' },
          runNitron: { from: 'input', key: 'runNitron' },
        },
      },
    ],
  };
}

function asDir(value: unknown, fallback: string, label: string): string {
  const raw = value != null && String(value).trim() !== '' ? String(value).trim() : fallback;
  const dir = resolve(raw);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`${label} 不是目录：${dir}`);
  }
  return dir;
}

export function createHandlers(host: PipelineHost): readonly WorkflowNodeHandler[] {
  const validate: WorkflowNodeHandler = {
    kind: 'web.validate',
    ports: { inputs: ['source'], outputs: ['sourceDir', 'files', 'ok'] },
    execute(_node, inputs) {
      const sourceDir = asDir(inputs.source, host.paths().sourceDir, 'web.validate source');
      const index = resolve(sourceDir, 'index.html');
      if (!existsSync(index)) throw new Error(`缺少 index.html：${index}`);
      const files = listSiteFiles(sourceDir);
      return Promise.resolve({ sourceDir, files, ok: true });
    },
  };

  const deploy: WorkflowNodeHandler = {
    kind: 'web.deploy',
    ports: { inputs: ['sourceDir', 'deployDir'], outputs: ['deployDir', 'url', 'files'] },
    execute(_node, inputs) {
      const sourceDir = asDir(inputs.sourceDir, host.paths().sourceDir, 'web.deploy sourceDir');
      const destRaw =
        inputs.deployDir != null && String(inputs.deployDir).trim() !== ''
          ? String(inputs.deployDir).trim()
          : host.paths().deployDir;
      const deployDir = resolve(destRaw);
      const files = copySite(sourceDir, deployDir);
      host.markDeployed();
      return Promise.resolve({ deployDir, url: host.paths().sitePath, files });
    },
  };

  const nitron: WorkflowNodeHandler = {
    kind: 'nitron.package',
    ports: { inputs: ['deployDir', 'runNitron'], outputs: ['mode', 'command', 'apk', 'log'] },
    async execute(_node, inputs) {
      const deployDir = asDir(inputs.deployDir, host.paths().deployDir, 'nitron.package deployDir');
      const config = nitronConfigPath(deployDir);
      if (!existsSync(config)) throw new Error(`缺少 nitron.config.json：${config}`);
      const build = shouldBuildNitron(inputs.runNitron);
      if (!build) {
        return {
          mode: 'dry-run',
          command: NITRON_COMMAND,
          apk: findApk(deployDir) ?? null,
          log: `未执行构建。设置 WH_NITRON=1 或 run({ input: { runNitron: true } }) 才会 npx nitron build。工作目录：${deployDir}`,
        };
      }
      const { stdout, stderr } = await runNitronBuild(deployDir);
      const apk = findApk(deployDir) ?? null;
      return {
        mode: 'build',
        command: NITRON_COMMAND,
        apk,
        log: [stdout, stderr].filter(Boolean).join('\n').trim() || (apk ? `APK: ${apk}` : 'nitron 已结束，未找到 app.apk'),
      };
    },
  };

  return [validate, deploy, nitron];
}

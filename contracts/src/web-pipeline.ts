/**
 * 服务契约层：web-pipeline。
 *
 * Web 优先的软件开发流水线节点（validate → deploy → 可选 nitron 打 APK）。
 * 调度仍在 workflow；本服务只提供图、路径与节点种类。不拥有 Electron UI。
 */
import type { WorkflowGraph, WorkflowRun } from './workflow.js';
import type { WorkflowNodeKindInfo } from './workflow-nodes.js';

export const WEB_PIPELINE_SERVICE = 'webPipeline';

export interface WebPipelinePaths {
  readonly sourceDir: string;
  readonly deployDir: string;
  readonly sitePath: '/site/';
}

export interface WebPipelineInspect {
  readonly paths: WebPipelinePaths;
  /** 未设 WH_NITRON=1 且 input.runNitron 不为真时，nitron.package 只打印命令 */
  readonly nitronDefault: 'dry-run' | 'build';
  readonly lastDeployAt?: number;
}

export interface WebPipelineRunInput {
  readonly runNitron?: boolean;
}

export interface WebPipelineService {
  pipelineGraph(): WorkflowGraph;
  kinds(): readonly WorkflowNodeKindInfo[];
  inspect(): WebPipelineInspect;
  paths(): WebPipelinePaths;
  /** 跑默认图。未传的入参由插件 config / 环境补齐；runNitron 缺省为 false（dry-run）。 */
  runPipeline(input?: WebPipelineRunInput): Promise<WorkflowRun>;
}

import type { PluginContext } from '@wizard-harness/core';
import type {
  AgentLoopService,
  QueryLoopService,
  AgentService,
  AppChatService,
  AppUiService,
  AppWorkflowService,
  CodeBrowserService,
  CodeEditorService,
  ConsoleService,
  DevToolsService,
  FileManagerService,
  LlmService,
  LoggerService,
  MemoryService,
  PersonaService,
  PromptContextService,
  SandboxService,
  SessionService,
  SkillsService,
  PrimitiveService,
  GitToolsService,
  KreaService,
  ToolboxService,
  TimerService,
  ToolsService,
  TrajectoryService,
  WebToolsService,
  WorkflowNodesService,
  WorkflowService,
  WebPipelineService,
} from './plugin-service-types.js';

/**
 * Cordis 风格属性访问：ctx.logger ≡ ctx.get('logger')（运行时由 Proxy 注入）。
 * 带 bind 的服务（tools、promptContext）经 ctx 访问时自动 bind(当前 ctx)，登记随插件卸载撤销。
 */
declare module '@wizard-harness/core' {
  interface PluginContext {
    readonly logger?: LoggerService;
    readonly console?: ConsoleService;
    readonly session?: SessionService;
    readonly llm?: LlmService;
    readonly tools?: ToolsService;
    readonly agent?: AgentService;
    readonly agentLoop?: AgentLoopService;
    readonly queryLoop?: QueryLoopService;
    readonly promptContext?: PromptContextService;
    readonly appUi?: AppUiService;
    readonly appChat?: AppChatService;
    readonly trajectory?: TrajectoryService;
    readonly sandbox?: SandboxService;
    readonly fileManager?: FileManagerService;
    readonly codeBrowser?: CodeBrowserService;
    readonly codeEditor?: CodeEditorService;
    readonly devTools?: DevToolsService;
    readonly toolbox?: ToolboxService;
    readonly gitTools?: GitToolsService;
    readonly timer?: TimerService;
    readonly skills?: SkillsService;
    readonly primitive?: PrimitiveService;
    readonly webTools?: WebToolsService;
    readonly krea?: KreaService;
    readonly persona?: PersonaService;
    readonly memory?: MemoryService;
    readonly workflow?: WorkflowService;
    readonly workflowNodes?: WorkflowNodesService;
    readonly appWorkflow?: AppWorkflowService;
    readonly webPipeline?: WebPipelineService;
  }
}

export type { PluginContext };

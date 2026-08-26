import type { PluginContext } from '@wizard-harness/core';
import type {
  AgentLoopService,
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
  GitToolsService,
  ToolboxService,
  TimerService,
  ToolsService,
  TrajectoryService,
  WebToolsService,
  WorkflowNodesService,
  WorkflowService,
} from './plugin-service-types.js';

/**
 * Cordis 风格属性访问：ctx.logger ≡ ctx.get('logger')（运行时由 Proxy 注入）。
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
    readonly webTools?: WebToolsService;
    readonly persona?: PersonaService;
    readonly memory?: MemoryService;
    readonly workflow?: WorkflowService;
    readonly workflowNodes?: WorkflowNodesService;
    readonly appWorkflow?: AppWorkflowService;
  }
}

export type { PluginContext };

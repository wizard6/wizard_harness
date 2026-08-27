import type { EventQuery } from '@wizard-harness/core';

export { LOGGER_SERVICE } from './logger.js';
export type { LoggerService } from './logger.js';
export { EVENTS_SERVICE } from './events.js';
export type { EventsService } from './events.js';
export { CONSOLE_SERVICE } from './console.js';
export type { ConsoleService, ExecResult } from './console.js';
export { SESSION_SERVICE } from './session.js';
export type {
  Session,
  SessionEntry,
  SessionInfo,
  SessionInspect,
  SessionKind,
  SessionPatch,
  SessionPeek,
  SessionService,
  SessionStartOpts,
} from './session.js';
export { LLM_SERVICE } from './llm.js';
export type {
  LlmCompleteInput,
  LlmCompleteResult,
  LlmMessage,
  LlmService,
  LlmToolCall,
  LlmToolSpec,
} from './llm.js';
export { TOOLS_SERVICE } from './tools.js';
export type {
  ToolCallContext,
  ToolCallResult,
  ToolHandler,
  ToolInfo,
  ToolSpec,
  ToolsService,
  ToolsView,
  ScopeRef,
} from './tools.js';
export { AGENT_SERVICE } from './agent.js';
export type { AgentHandle, AgentInfo, AgentService, AgentSpawnOpts } from './agent.js';
export { AGENT_LOOP_SERVICE } from './agent-loop.js';
export type { AgentLoopResult, AgentLoopRunOpts, AgentLoopService } from './agent-loop.js';
export { QUERY_LOOP_SERVICE } from './query-loop.js';
export type {
  QueryHook,
  QueryHookAction,
  QueryHookContext,
  QueryHookResult,
  QueryLoopInspect,
  QueryLoopService,
  QueryStage,
  QueryToolIntent,
} from './query-loop.js';
export { PROMPT_CONTEXT_SERVICE } from './prompt-context.js';
export type {
  AssembleContext,
  AssembledContextEntry,
  AssembledSection,
  ContextUsageBreakdown,
  ContextUsageCategory,
  ContextUsageCategoryId,
  ContextUsageInput,
  ContextUsageReport,
  PromptApplied,
  PromptAssembly,
  PromptContextBinding,
  PromptContextEntry,
  PromptContextService,
  PromptInspect,
  PromptSection,
  PromptSource,
  PromptSourceKind,
} from './prompt-context.js';
export { APP_UI_SERVICE } from './app-ui.js';
export type { AppUiService } from './app-ui.js';
export { APP_CHAT_SERVICE } from './app-chat.js';
export type { AppChatSendOpts, AppChatSendResult, AppChatService, AppChatMessagePreview, AppChatResumeResult, AppChatSessionSummary } from './app-chat.js';
export { TRAJECTORY_SERVICE } from './trajectory.js';
export type {
  Trajectory,
  TrajectoryKind,
  TrajectoryService,
  TrajectorySnapshot,
  TrajectorySpan,
  TrajectorySummary,
} from './trajectory.js';
export { SANDBOX_SERVICE } from './sandbox.js';
export type { SandboxEntry, SandboxInfo, SandboxList, SandboxService } from './sandbox.js';
export { FILE_MANAGER_SERVICE } from './file-manager.js';
export type { FileManagerEntry, FileManagerInfo, FileManagerList, FileManagerService } from './file-manager.js';
export { CODE_BROWSER_SERVICE } from './code-browser.js';
export type { CodeBrowserInfo, CodeBrowserReadResult, CodeBrowserService } from './code-browser.js';
export { CODE_EDITOR_SERVICE } from './code-editor.js';
export type {
  CodeEditorInfo,
  CodeEditorOpenTarget,
  CodeEditorReadResult,
  CodeEditorService,
} from './code-editor.js';
export { DEV_TOOLS_SERVICE } from './dev-tools.js';
export type { DevToolsInfo, DevToolsService } from './dev-tools.js';
export { TOOLBOX_SERVICE } from './toolbox.js';
export type { ToolboxInfo, ToolboxParamInfo, ToolboxRunResult, ToolboxScriptInfo, ToolboxScriptKind, ToolboxService } from './toolbox.js';
export { TIMER_SERVICE } from './timer.js';
export type {
  TimerAction,
  TimerActionKind,
  TimerCreateOpts,
  TimerFlowBranch,
  TimerFlowDef,
  TimerFlowRunView,
  TimerFlowStep,
  TimerInspect,
  TimerJobState,
  TimerJobView,
  TimerLogEntry,
  TimerOnError,
  TimerRunState,
  TimerRunView,
  TimerSchedule,
  TimerScheduleKind,
  TimerService,
  TimerTraceNode,
  TimerTraceState,
  TimerTraceTree,
  TimerTraceWhen,
  TimerUpdatePatch,
} from './timer.js';
export { SKILLS_SERVICE } from './skills.js';
export type { SkillDetail, SkillInfo, SkillsService, SkillsSnapshot } from './skills.js';
export { POMODORO_SERVICE } from './pomodoro.js';
export type {
  PomodoroConfigurePatch,
  PomodoroConfig,
  PomodoroPhase,
  PomodoroService,
  PomodoroState,
} from './pomodoro.js';
export { GIT_TOOLS_SERVICE, gitToolName } from './git-tools.js';
export type {
  GitProbe,
  GitRunResult,
  GitToolsInfo,
  GitToolsRunOpts,
  GitToolsService,
} from './git-tools.js';
export { WEB_TOOLS_SERVICE } from './web-tools.js';
export type { WebToolsInfo, WebToolsService } from './web-tools.js';
export { KREA_SERVICE } from './krea.js';
export type {
  KreaGenerateInput,
  KreaInfo,
  KreaJobView,
  KreaModelInfo,
  KreaService,
} from './krea.js';
export { PERSONA_SERVICE, PERSONA_SOUL_LIMIT } from './persona.js';
export type {
  PersonaCreateInput,
  PersonaGuide,
  PersonaGuideField,
  PersonaProfile,
  PersonaReadResult,
  PersonaSavePatch,
  PersonaService,
  PersonaSnapshot,
  PersonaSummary,
  PersonaUpdateInput,
} from './persona.js';
export { MEMORY_SERVICE } from './memory.js';
export type {
  MemoryBreathResult,
  MemoryBucket,
  MemoryBucketType,
  MemoryGrowInput,
  MemoryHoldInput,
  MemoryPreview,
  MemoryPulse,
  MemorySearchHit,
  MemorySearchOpts,
  MemoryService,
  MemorySnapshot,
  MemoryTracePatch,
} from './memory.js';
export { WORKFLOW_SERVICE, workflowToolName } from './workflow.js';
export type {
  WorkflowExecOpts,
  WorkflowGraph,
  WorkflowListedKind,
  WorkflowNode,
  WorkflowNodeAsTool,
  WorkflowNodeContext,
  WorkflowNodeHandler,
  WorkflowNodePorts,
  WorkflowNodeRecord,
  WorkflowRun,
  WorkflowRunOpts,
  WorkflowService,
  WorkflowWire,
} from './workflow.js';
export { WORKFLOW_AGENT_KIND, WORKFLOW_AGENT_PORTS } from './workflow-agent.js';
export type { WorkflowAgentNodeOutput } from './workflow-agent.js';
export { WORKFLOW_NODES_SERVICE } from './workflow-nodes.js';
export type { WorkflowNodeKindInfo, WorkflowNodesService } from './workflow-nodes.js';
export { APP_WORKFLOW_SERVICE } from './app-workflow.js';
export type { AppWorkflowService } from './app-workflow.js';
/** 事件查询契约（core reader 定义，契约包统一转发） */
export type { EventQuery } from '@wizard-harness/core';

import './plugin-context.js';

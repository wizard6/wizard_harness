import type { PluginContext, EventQuery } from '@wizard-harness/core';
import type { LoggerService } from './logger.js';
import type { EventsService } from './events.js';
import type { ConsoleService } from './console.js';
import type { SessionService } from './session.js';
import type { LlmService } from './llm.js';
import type { ToolsService } from './tools.js';
import type { AgentService } from './agent.js';
import type { AgentLoopService } from './agent-loop.js';
import type { SystemPromptService } from './system-prompt.js';
import type { AppUiService } from './app-ui.js';
import type { AppChatService } from './app-chat.js';
import type { TrajectoryService } from './trajectory.js';

export { LOGGER_SERVICE } from './logger.js';
export type { LoggerService } from './logger.js';
export { EVENTS_SERVICE } from './events.js';
export type { EventsService } from './events.js';
export { CONSOLE_SERVICE } from './console.js';
export type { ConsoleService, ExecResult } from './console.js';
export { SESSION_SERVICE } from './session.js';
export type { Session, SessionEntry, SessionKind, SessionService } from './session.js';
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
export type { ToolCallResult, ToolHandler, ToolInfo, ToolSpec, ToolsService } from './tools.js';
export { AGENT_SERVICE } from './agent.js';
export type { AgentHandle, AgentInfo, AgentService, AgentSpawnOpts } from './agent.js';
export { AGENT_LOOP_SERVICE } from './agent-loop.js';
export type { AgentLoopResult, AgentLoopRunOpts, AgentLoopService } from './agent-loop.js';
export { SYSTEM_PROMPT_SERVICE } from './system-prompt.js';
export type { SystemPromptService } from './system-prompt.js';
export { APP_UI_SERVICE } from './app-ui.js';
export type { AppUiService } from './app-ui.js';
export { APP_CHAT_SERVICE } from './app-chat.js';
export type { AppChatSendOpts, AppChatSendResult, AppChatService } from './app-chat.js';
export { TRAJECTORY_SERVICE } from './trajectory.js';
export type {
  Trajectory,
  TrajectoryKind,
  TrajectoryService,
  TrajectorySnapshot,
  TrajectorySpan,
  TrajectorySummary,
} from './trajectory.js';
/** 事件查询契约（core reader 定义，契约包统一转发） */
export type { EventQuery } from '@wizard-harness/core';

/**
 * Cordis 风格属性访问：ctx.logger ≡ ctx.get('logger')（运行时由 Proxy 注入）。
 * 仅对与 PluginContext 内置成员无名字冲突的服务建立映射：
 * - logger / console 名字空闲 → 属性访问
 * - events 与内置 ctx.events（事件观测侧）冲突 → 走 ctx.get<EventsService>('events')
 *
 * 消费方 import 本包（或任何导出）即引入此增强，ctx.logger 获得完整类型。
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
    readonly systemPrompt?: SystemPromptService;
    readonly appUi?: AppUiService;
    readonly appChat?: AppChatService;
    readonly trajectory?: TrajectoryService;
  }
}

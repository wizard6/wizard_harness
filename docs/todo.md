# Agent 能力待办

> 来源：薄切片 agent 链已齐，但还不能当产品用。排序按依赖：先能调起来，再协议与真模型，再流式/取消，最后落盘与通用桥。
> 插件说明：`docs/plugins/*.html`。本页记顺序与实现结果。

## 顺序

| # | id | 项 | 状态 | 为何排这里 |
|---|-----|-----|------|------------|
| 1 | rpc-expose | 观测台 RPC + 试跑入口 | 已落地 | 不改任意方法桥也能从壳调用 |
| 2 | real-llm | 真模型：env `WH_LLM_*` | 已落地 | 已有 openai 适配器，先把密钥/地址从环境接入 |
| 3 | more-tools | 内置工具 `now` / `upper` | 已落地 | 协议升级前先有可调工具 |
| 4 | tool-calls | 官方 `tool_calls` | 已落地 | 循环改吃模型返回的调用；文本协议作回退 |
| 5 | llm-stream | llm 流式 | 已落地 | complete 的 delta / SSE |
| 6 | loop-cancel | agent-loop 取消 | 已落地 | 依赖 complete 的 AbortSignal |
| 7 | session-persist | session 持久化 | 已落地 | 关进程不丢 |
| 8 | compaction | session compaction | 已落地 | 依赖可写回的 session |
| 9 | ui-bridge | 弹窗白名单 RPC | 已落地 | 插件 `ui.rpc` 声明才放行，不是任意方法桥 |
| 10 | app-ui-plugin | App demo 收成插件 + profile 复合 | 已落地 | 产品面也是插件，不要写死在观测台 |

## 实现结果

### 1. 观测台 RPC + 试跑

- **obs:api**：未设 `WH_EXPOSE` 时默认暴露 `agent.list|stop`、`systemPrompt.set|get|apply`、`agentLoop.run|cancel`。`off` 或 `{}` 关闭。不含 `console.exec` / `tools.call`。
- **观测台**：独立窗口 **App demo**（标题栏 / 托盘进入），经 IPC `wh:call-service` 调同一白名单。`agent.spawn` 不暴露（句柄带 ctx，不能 JSON）。
- 文档：`README.md` 环境变量；本页。

### 2. 真模型 env

- `WH_LLM_PROVIDER` / `WH_LLM_BASE_URL` / `WH_LLM_API_KEY` / `WH_LLM_MODEL` 覆盖插件 config。`openai` 或 `deepseek` 且有 baseUrl 才走 HTTP（deepseek 可省略地址，默认官方）。密钥只放本机 `$WH_HOME/wizard.patch.json`，不要提交仓库。
- 文档：`docs/plugins/llm.html`。

### 3. 内置工具

- `echo`、`now`（ISO 时间）、`upper`（`args.input` 大写）。无 shell。
- 文档：`docs/plugins/tools.html`。

### 4. 官方 tool_calls

- `llm.complete({ tools })` 把 OpenAI `tool_calls` 带回；mock 在 user 为 `echo …` 且 tools 含 echo 时直接返回调用。
- tool-result 投影为 `role: tool`。循环优先 `result.toolCalls`，否则文本协议。
- 文档：`docs/plugins/llm.html`、`docs/plugins/agent-loop.html`。

### 5. llm 流式

- `onDelta`；观测 `llm/delta`。openai **无 tools** 时走 SSE；有 tools 时等完整响应（需要 tool_calls）。
- 文档：`docs/plugins/llm.html`。

### 6. agent-loop 取消

- `complete({ signal })`；`agentLoop.cancel(agentId)` abort 该次 run。空闲 cancel 无操作。
- 文档：`docs/plugins/agent-loop.html`。

### 7. session 持久化

- `config.persistDir` 或 `WH_SESSIONS_DIR`。GUI/API 默认 `~/.wizard-harness/sessions/{id}.json`。vitest 忽略环境变量，避免测脏。
- 文档：`docs/plugins/session.html`。

### 8. compaction

- `session.compact(id, { keep })`：丢掉最老条目，写一条 `turn { phase:'compact' }`。agent-loop `compactKeep` 默认 0。
- 文档：`docs/plugins/session.html`。

### 9. 弹窗白名单 RPC

- `PluginUi.rpc: { 服务名: 方法[] }`。preload-safe 暴露 `wh.call`；主进程按弹窗所属插件校验。agent-loop 弹窗声明 `run`/`cancel` 并可点运行。
- **不是**任意服务桥。产品聊天走 `app-ui` 的 `ui.rpc` → `appChat`；观测台壳白名单仍给 HTTP `/rpc` 用。

### 10. App demo 是插件

- `app-chat`：包装 `agentLoop`（默认提示词 / 步数），无窗口。
- `app-ui`：薄壳窗口，`inject: appChat`（轨迹可选），`ui.rpc` 放行 `appChat.send|cancel` 与 `trajectory.latest|list|snapshot`。右栏展示本轮时间线。
- 组合：`bundles/app` insert `app-chat` 再 `app-ui`。观测台只 `openPlugin('app-ui')`。
- 文档：`docs/plugins/app-chat.html`、`docs/plugins/app-ui.html`。

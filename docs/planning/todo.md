# Agent 能力待办

> 插件说明：`docs/plugins/*.html`。路线图体感排序见 [`product-maturity.html`](./product-maturity.html)。文档索引见 [`docs/README.md`](../README.md)。

## 第一阶段（已完成）

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

## 第二阶段（已完成）

| # | id | 项 | 状态 | 为何排这里 |
|---|-----|-----|------|------------|
| 11 | fail-closed | agent-loop **必选** promptContext；去掉 observe 静默降级 | 已落地 | 卸组装器后 App 不能假装正常聊；结构债 #1 |
| 12 | persona-one-path | 人设只从 prompt-context 登记；去掉 send/run 旁路 | 已落地 | 单一真源；结构债 #2 |
| 13 | tools-via-assemble | tools 向 promptContext.tools() 登记；observe 只用 assembly.tools | 已落地 | 工具表只从组装器出门；结构债 #3 |
| 14 | tools-scope | tools 用 ScopedLayers；多 agent 同名工具互不可见 | 已落地 | 路线图 P0；依赖 #13 更顺 |
| 15 | agent-thin-visible | App 复用 agentId；Agent 弹窗列 live 实例 | 已落地 | 结构债 #4 |
| 16 | app-gap-copy | App 缺 prompt-context 时聊天区人话提示 | 已落地 | 结构债 #5；体验层，依赖 #11 |
| 17 | app-session-list | app-ui 会话列表 + 恢复继续聊 | 已落地 | 路线图 P0；持久化已有、UI 断层 |
| 18 | app-stream-ui | 流式 delta 进聊天气泡 + 取消联动 | 已落地 | 路线图 P1；后端 onDelta 已有 |
| 19 | app-error-visible | 鉴权/超时/tool 失败可读文案 + trajectory 详情 | 已落地 | 路线图 P1 |
| 20 | manifest-validate | boot 校验 manifest / inject / ui.rpc 形状 | 已落地 | 路线图 P1；插件多了 fail-loud |

---

## 第三阶段 · P2（已完成）

| # | id | 项 | 状态 | 说明 |
|---|-----|-----|------|------|
| 21 | docs-health | 项目体检 + 排错短链 | 已落地 | `reference/项目体检.md` · `guides/troubleshooting.html` |
| 22 | gui-plugin-toggle | 观测台禁/启用 + home patch | 已落地 | Registry 禁用按钮 · `setDisabledPlugins` · `upsertHomePatch` |
| 23 | plugin-sdk | plugin-sdk + plugin-testing + 示例 | 已落地 | `@wizard-harness/plugin-sdk` · `examples/minimal-plugin` |

---

## 第二阶段 · 实现结果

### 17. App 会话列表 + 恢复

- **app-chat**：`inject: agent · session`；`listSessions()` 读 session 列表并带预览；`resumeSession(id)` 绑定已有 agent 或 spawn 新实例，返回历史消息。
- **app-ui**：左侧「历史会话」栏；`pullSessions` / `loadSession` 经 `ui.rpc` 调 `appChat.listSessions|resumeSession`；恢复后继续发消息复用同一 sessionId / agentId。

### 18. 流式 UI + 取消

- **agent-loop**：`run({ onDelta })` 透传到 `llm.complete`。
- **llm**：`llm/delta` 事件 payload 含 `{ bytes, chunk }`。
- **app-ui**：发送时轮询 `wh.eventsHistory()` 收 delta 追加到助手气泡；发送中显示 Cancel → `appChat.cancel(agentId)`。

### 19. 错误可见

- **app-ui**：`humanError()` 映射鉴权/超时/取消/tool 等；`showError()` 在气泡区展示 title + detail + hint；右栏 trajectory 仍可看详情。

### 20. manifest 校验

- **core**：`validatePlugin()` = manifest + inject 布尔 + ui.rpc 字符串数组 + register 函数；`boot` 预检畸形插件进 `failures`；`reload` 同样走 `validatePlugin`。单测覆盖 inject / ui.rpc 非法形状。

---

## 第一阶段 · 实现结果

### 1. 观测台 RPC + 试跑

- **obs:api**：未设 `WH_EXPOSE` 时默认暴露 `agent.list|stop`、`promptContext.assemble|apply|setPersona|getPersona|inspect`、`agentLoop.run|cancel`。`off` 或 `{}` 关闭。不含 `console.exec` / `tools.call`。
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

- `app-chat`：包装 `agentLoop`（步数），无窗口。默认人设不在这里。
- `app-ui`：薄壳聊天窗口，`inject: appChat`（轨迹 / 沙箱可选），`ui.rpc` 放行 `appChat.send|cancel`、`trajectory.latest|list|snapshot`、`sandbox.info|list`。右栏展示本轮时间线，顶栏显示沙箱 root。
- `persona`：人格 / 习惯 / 记忆；`bundles/base` 在 `prompt-context` 之后插入。弹窗可改；`persona_remember` 登记到 tools。
- `workflow` / `workflow-nodes` / `app-workflow`：调度、两个节点、独立 Demo 窗口。
- 组合：`bundles/base` 含 `persona`；`bundles/app` insert `sandbox`、`dev-tools`、`web-tools`、`workflow`、`workflow-nodes`、`app-workflow` 再 `app-chat` 再 `app-ui`。观测台只 `openPlugin('app-ui')`；托盘另有 Workflow demo。
- 文档：`docs/plugins/app-chat.html`、`docs/plugins/app-ui.html`、`docs/plugins/persona.html`、`docs/plugins/sandbox.html`、`docs/plugins/dev-tools.html`、`docs/plugins/web-tools.html`、`docs/plugins/workflow.html`、`docs/plugins/workflow-nodes.html`、`docs/plugins/app-workflow.html`。

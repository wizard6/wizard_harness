# Agent 结构改造（逐项处理）

> **文档纪律：** 插件 HTML / README / 契约注释只写**当前代码**。目标改动只写本文件；未打勾不得当成已实现。  
> **禁词：** 没有 `system-prompt` 插件，也没有名为 `systemPrompt` 的服务。组装器是 `prompt-context` / `promptContext`。禁止为「对齐旧文档」再造 system-prompt。`AgentLoopRunOpts.systemPrompt` 与 app-chat `config.systemPrompt` 是弃用别名，删它们属于第 2 项。

原则：不把 agent / loop / prompt-context 焊回一个大插件。  
Agent 仍是身份；loop 仍是 OTA；prompt-context 仍是拼装。改的是 **必选关系、单一入口、卸了要看得见**。  
处理时：做完一项把 `[ ]` 改成 `[x]`，并在该项下补「落地」两三句。

现状（问题）：App 不依赖组装器 → 卸掉 prompt-context 仍能聊；人设/工具有多条入口；Agent 只是 session 标签。

```
app-ui → app-chat → agent-loop
                         ├ observe：prompt-context（现在可选，缺失则静默跳过）
                         ├ think：llm.complete
                         └ act：tools.call
agent = scope + 绑 session
```

目标：产品路径上没有 prompt-context 就不能当完整助手跑；人设和工具表只从组装器出门。

---

## 顺序

| # | id | 项 | 状态 |
|---|-----|-----|------|
| 1 | fail-closed | 产品路径上 prompt-context 必选；卸载要失败得看得见 | 待做 |
| 2 | persona-one-path | 人设只写进 prompt-context | 待做 |
| 3 | tools-via-assemble | 交给模型的工具表只来自 assemble | 待做 |
| 4 | agent-thin-visible | Agent 继续薄，但 live 实例可看见、App 复用同一 id | 待做 |
| 5 | app-gap-copy | App 缺组装器时说人话，不装正常 | 待做 |

建议：先 1，再 2/3，最后 4/5。

---

## 1. 产品路径失败要响 `[ ]`

**要改成：** 被 App 用到的 agent-loop **必须** inject `promptContext`。卸掉 prompt-context 后 loop 挂起（或 boot 失败），App 不能继续当正常助手聊。观测台卸载时，若仍有必选依赖方，不能当没发生。

**不要：** 把拼装逻辑写进 loop / agent。

**可能动到的文件：**

- `plugins/agent-loop/src/index.ts`（`promptContext: false` → `true`）
- `plugins/agent-loop/src/loop.ts` / `ota.ts`（去掉「没 prompts 就 `tools.list()`」的降级）
- `plugins/agent-loop/test/agent-loop.spec.ts`
- 注册器卸载路径（有必选依赖时拒绝或级联提示）
- `docs/plugins/agent-loop.html`

**验收：** 观测台卸掉 Prompt Context 后，App 发消息失败或明确不可用；装回后恢复。

**落地：** 2026-08-24 仅文档/注释：标明可选 inject 是债。`promptContext: false` 未改。

---

## 2. 人设只写进 prompt-context `[ ]`

**要改成：** 默认 persona 只在 prompt-context 登记（`section` / `setPersona`）。app-chat 启动时登记一次，或写在 profile/config 里由 prompt-context 读。loop 只 `assemble + apply`，不再经 `run({ persona })` 另存一份。

**不要：** 在 app-chat、loop、prompt-context 三处各留一份「系统提示」。

**可能动到的文件：**

- `plugins/app-chat/src/index.ts`（去掉每次 send 传 persona；改为登记 section）
- `contracts/src/agent-loop.ts`（删 `systemPrompt` 别名；评估是否保留 `persona`）
- `plugins/agent-loop/src/loop.ts`（`setPersona` 仅当调用方显式覆盖）
- `docs/plugins/app-chat.html`、`docs/plugins/agent-loop.html`

**验收：** 改默认人设只动 prompt-context（或 app-chat 的一次 `section`）；Prompt Context 窗口素材列能看到它。

**落地：** 2026-08-24：文档写明 `systemPrompt` 是弃用字段不是服务。send 仍传 persona。

---

## 3. 工具表只经组装器出门 `[ ]`

**要改成：** `tools` 插件向 prompt-context 登记 `tools()`。`observe` 只用 `assembly.tools`。没有组装器时不准 `tools.list()` 兜底（由第 1 项保证组装器在）。

**不要：** observe 里两套工具来源。

**可能动到的文件：**

- `plugins/tools/src/index.ts`（inject prompt-context 可选或必选，register 时 `tools()`）
- `plugins/agent-loop/src/ota.ts`（删 list 兜底）
- `plugins/prompt-context` 窗口应能看到工具素材
- 相关 spec、`docs/plugins/tools.html`

**验收：** Prompt Context 素材列出现工具；卸掉 prompt-context 后模型拿不到工具表（且 App 按第 1 项不可用）。

**落地：** 2026-08-24：`ota.ts` 注释标明 `tools.list()` 兜底是债。行为未改。

---

## 4. Agent 继续薄，但别当空气 `[ ]`

**要改成：** agent 插件仍不管循环、不管拼装。管 `spawn / get / list / stop`、一条 session。App 连续对话必须复用同一个 `agentId`。Agent 窗口列出 live 实例（id、sessionId）。

**不要：** 把 OTA 写回 agent 插件。

**可能动到的文件：**

- `plugins/app-chat/src/index.ts`（确认 agentId 往返）
- `plugins/app-ui/src/page.ts`（同一窗口保持 agentId；新对话才换）
- `plugins/agent` 弹窗（从说明卡改成实例列表，需 `ui.rpc`）
- `docs/plugins/agent.html`（已对齐 prompt-context；改 live 列表时同步）

**验收：** 连发几句仍是同一个 agent；Agent 窗口看得到。

**落地：** 2026-08-24：`docs/plugins/agent.html`、契约注释、README 已改为 prompt-context。live 列表 UI 仍待做。

---

## 5. App 声明缺口 `[ ]`

**要改成：** 与轨迹栏一样，缺 prompt-context 时聊天区写一句人话（「上下文组装器未装入」），不要空回复或装作完整助手。

**依赖：** 第 1 项之后，这条是体验，不是唯一防护。

**可能动到的文件：**

- `plugins/app-ui/src/index.ts`（`inject: { promptContext: false }` 仅用于探测）
- `plugins/app-ui/src/page.ts`（检测 inspect/assemble 不可用时提示）
- `docs/plugins/app-ui.html`

**验收：** 卸掉 prompt-context 后打开 App demo，未发送就能看出缺组装器。

**落地：** 2026-08-24：`docs/plugins/app-ui.html` 记下缺口。聊天区尚无提示。

---

## 明确不做

- 合并 agent + agent-loop + prompt-context
- 把用量面板做进 prompt-context（用量是只读占用，另议）
- 为了「还能聊」保留 assemble 缺失时的 tools.list() 降级

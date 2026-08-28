# Ombre-Brain · 拆分

> 源仓：[P0luz/Ombre-Brain](https://github.com/P0luz/Ombre-Brain)  
> 成对文档：[理解](./understanding.md) · [HTML](./breakdown.html)  
> 用途：指导 `plugins/memory` 借鉴，不替代 persona / session。

## 1. 模块切分

| 源仓模块 | 是否借鉴 | 落点 | 说明 |
| --- | --- | --- | --- |
| Markdown vault + frontmatter | 是 | `$WH_HOME/memory/` | 真源；向量库不进底座 |
| decay_engine 遗忘分 | 是（简化） | `plugins/memory` | 读时扫描归档；无 BM25/embedding |
| breath 权重池 | 是 | `memory:breath` section | 空则 `''` |
| hold / grow / trace / pulse | 是 | `tools.register` | 器官化动词 |
| MCP / REST 壳 | 否 | — | 已有 tools 总线 |
| Dashboard / OAuth / Tunnel | 否 | 插件弹窗只做列表 | 产品壳 |
| kernel/rust 账本 | 否 | — | 源仓也未接线 |
| feel / plan / letter / I·You·Them | 推迟 | — | 情绪器官扩展 |

## 2. 与 wizard-harness 的映射

| Ombre | harness | 说明 |
| --- | --- | --- |
| MCP tools | `tools.register` | 走现有 tools 总线 |
| Markdown vault | `$WH_HOME/memory/` | 本地真源 |
| Dashboard | 插件弹窗 | 只做列表 / breath 预览 / 归档 |
| SessionStart hook | `prompt-context` live section `memory:breath` | 开场自动附带浮现摘要 |
| 人格 / 短记忆 | `persona`（soul.md，不存记忆） | memory 只管经历桶 |

## 3. 已落地（`plugins/memory`）

- vault Markdown + frontmatter
- decay 分数 + 读时归档扫描
- `breath` / `breath_search` / `hold` / `grow` / `trace` / `pulse`
- pinned 稀缺（≤20）、archive≠delete、reinforce 显式
- prompt-context：`memory:breath`（order 9）；空则 `''`
- 工具：`memory_breath`、`memory_search`、`memory_hold`、`memory_trace`、`memory_pulse`

## 4. 刻意推迟

feel / plan / letter / I / You / Them、LLM dehydrator 自动打标、BM25/embedding、Dashboard/OAuth/Tunnel、关系图自动接线。

## 5. 借鉴时注意

1. **记忆 ≠ 指令**：vault 文本是历史，不是系统提示权威（那是 persona soul）。
2. **稀缺即结构**：钉住与坐标系必须有上限。
3. **元数据不喂进算分**：`why_remembered` 只解释，不优化。
4. **第一人称工具文案**：返回给模型时用「我记得…」，避免「帮用户存了」。
5. 改 `plugins/memory` 行为时，同步本文「已落地」与 [docs/plugins/memory.html](../../../docs/plugins/memory.html)。

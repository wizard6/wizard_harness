# Ombre-Brain 对照分析

> 源仓：[P0luz/Ombre-Brain](https://github.com/P0luz/Ombre-Brain)  
> 用途：为 `plugins/memory` 提供设计依据。本地可读副本可放在 `temp/Ombre-Brain`（不入库）。

## 1. 它是什么

给 **模型自己** 用的长期情绪记忆系统：Markdown 桶 + Russell 效价/唤醒度坐标 + 改进艾宾浩斯衰减 + 混合检索（关键词 / BM25 / 向量）+ MCP 器官化工具（`breath` / `hold` / `grow` / `trace` …）。

一句话：**不是键值库，是让模型「过日子」的连续记忆。**

## 2. 架构快照

```
MCP / REST / Dashboard
        ↓
  tools（breath · hold · grow · trace · dream · …）
        ↓
  bucket_manager + decay_engine + search + embedding(outbox)
        ↓
  Markdown vault（真源） + embeddings.db（可重建）
```

| 目录 | 角色 |
| --- | --- |
| `src/tools/` | 器官工具实现 |
| `src/decay_engine.py` | 遗忘分数与归档周期 |
| `src/ombrebrain/retrieval/` | 混合打分 |
| `frontend/` | 人类 Dashboard（产品壳） |
| `kernel/rust/` | 账本脚手架，尚未接线 |

**真源**：`buckets_dir` 下 Markdown。向量 / BM25 可丢可重建。

## 3. 数据模型（必须理解）

一条记忆 = 一个 `.md`：YAML frontmatter + 正文。

| 字段 | 含义 |
| --- | --- |
| `id` / `name` / `domain` / `tags` | 标识与分类 |
| `valence` / `arousal` ∈ [0,1] | Russell 环形情感坐标（连续，非离散心情标签） |
| `importance` 1–10 | 普通评分，**不是**硬精英配额 |
| `type` | `dynamic` / `permanent` / `feel` / `plan` / `letter` / `archived` … |
| `created` / `last_active` / `activation_count` | 时间与触达 |
| `pinned` | 核心准则，配额约 20，固定高分 |
| `protected` | 抗衰减但不自发浮现 |
| `anchor` | 冷坐标系，硬上限 24，不进普通 breath |
| `resolved` / `digested` / `dont_surface` | 降权 / 隐藏自发浮现 / 主动遗忘 |
| `why_remembered` | 元描述，**不参与**衰减打分 |

| 状态 | 自发 breath | 显式搜索 | 衰减 |
| --- | --- | --- | --- |
| 普通未解决 | 按分数 | 是 | 是 |
| pinned | 核心块 | 是 | 否（满分短路） |
| protected / anchor | 否 | 是 | 否 / 跳过 |
| resolved | 降权 | 是 | 更快淡 |
| archived | 否 | 可发现 + 邀恢复 | 终端 |

**设计硬规则**：遗忘 = 淡入 `archive/`，不是物理删除；读 ≠ 强化，强化需显式 `trace(reinforce=True)`。

## 4. 核心算法

### 4.1 遗忘曲线（`decay_engine`）

```
score = importance
      × activation_count^0.3
      × e^(-λ × days_since)     # λ≈0.05
      × combined_weight
      × resolved_factor
      × urgency_boost
```

- `time_weight = 1 + e^(-hours/36)`（约 36h 半衰期）
- `emotion_weight = 1 + arousal × 0.8`
- ≤3 天：`combined = time×0.7 + emotion×0.3`；之后反转权重
- unresolved=`1`；resolved=`0.05`；resolved∧digested=`0.02`
- arousal>0.7 且未 resolved → `×1.5`
- 周期：低重要度久未活动可 auto-resolve；`score < 0.3` → archive

### 4.2 breath 浮现（权重池，不是搜索）

1. pinned / permanent →「核心准则」
2. 过滤 dont_surface / digested / anchor / protected / feel / plan …
3. 按 `calculate_score` 排序；冷启动插入（activation=0 且 importance≥8，最多 2）
4. 近 7 天保留约 3 个 recent slots
5. 尾部「久未浮现」1–2 条高重要度冷桶

### 4.3 混合检索

主题（模糊匹配）+ 情感距离 + 时间 + importance + touch +（可选）语义 + BM25。向量离线时降级关键词，不静默失读。

## 5. 工具节奏（给模型）

```
开场 → breath()                 # 0 参数，必做
谈及 → breath_search(query)
写入 → hold / grow
收束 → trace(resolve / pin / …)
可选 → dream / feel / plan / pulse / anchor
```

器官化命名（hold/grow/trace），避免 CRUD 动词占领工具位。

## 6. 与 wizard-harness 的映射

| Ombre | harness | 说明 |
| --- | --- | --- |
| MCP tools | `tools.register` | 走现有 tools 总线 |
| Markdown vault | `$WH_HOME/memory/` | 本地真源 |
| Dashboard | 插件弹窗 | 只做列表 / breath 预览 / 归档，不做完整运维台 |
| SessionStart hook | `prompt-context` live section `memory:breath` | 开场自动附带浮现摘要 |
| persona 短记忆 | 仍归 `persona` | memory 管跨会话经历桶，不替代人设 |

### 已落地（`plugins/memory`）

- vault Markdown + frontmatter
- decay 分数 + 读时归档扫描
- `breath` / `breath_search` / `hold` / `grow` / `trace` / `pulse`
- pinned 稀缺（≤20）、archive≠delete、reinforce 显式
- prompt-context：`memory:breath`（order 9）；空则 `''`
- 工具：`memory_breath`、`memory_search`、`memory_hold`、`memory_trace`、`memory_pulse`

### 刻意推迟

feel / plan / letter / I / You / Them、LLM dehydrator 自动打标、BM25/embedding、Dashboard/OAuth/Tunnel、关系图自动接线。

## 7. 对照时注意

1. **记忆 ≠ 指令**：vault 文本是历史，不是系统提示权威。
2. **稀缺即结构**：钉住与坐标系必须有上限。
3. **元数据不喂进算分**：`why_remembered` 只解释，不优化。
4. **第一人称工具文案**：返回给模型时用「我记得…」语气，避免「帮用户存了」。

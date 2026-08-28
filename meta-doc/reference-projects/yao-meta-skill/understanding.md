# Yao Meta Skill · 理解

> 源仓：[yaojingang/yao-meta-skill](https://github.com/yaojingang/yao-meta-skill)（MIT）  
> 成对文档：[拆分](./breakdown.md) · [HTML](./understanding.html)  
> 本地副本可放 `temp/yao-meta-skill`（不入库）。

## 1. 它是什么

`YAO` = **Yielding AI Outcomes**：目标不是再写一堆 prompt，而是产出**可复用的 AI 资产**和可运营结果。

`yao-meta-skill` 本身是一个 **meta-skill**（教 Agent 如何创建 / 改进 / 评测 / 打包其它 skill）。1.0 把重复工作流变成可安装的 `SKILL.md` 包；2.0 扩成 Skill OS：一份语义合同（Skill IR）→ 多端编译 → 评测证据 → 发布门禁 → 运营漂移闭环。

一句话：**把「口头流程 / 聊天习惯」变成带触发面、评测和治理的技能包工厂。**

对照它自己的定位：Anthropic Skill Creator 偏对话式写 skill；OpenAI skill-creator 偏精简写作指南；Yao 偏工程化、评测、跨端与发布证据。

## 2. 架构（Skill OS 2.0）

```
输入（workflow / prompt / transcript / docs）
        ↓
意图模型（job / outputs / exclusions / standards）
        ↓
Skill IR（触发、契约、资源、证据）
        ↓
    ┌─── 技能包 SKILL.md / references / scripts / reports
    └─── 目标编译 OpenAI / Claude / generic / Agent Skills / VS Code
        ↓
Eval Lab（trigger / output / benchmark / runtime）
        ↓
Review Studio（门禁 / 警告 / waiver）
        ↓
发布边界（包校验 / 安装模拟 / claim guard）
        ↓
SkillOps（feedback / adoption drift / 下一轮）
```

读十秒：先把任务说清楚，再把语义合同和平台格式分开，评测变成可审的证据，发布不许超出现有证据，运营信号只驱动下一轮而不是静默改包。

## 3. 包形态（必须理解）

一个可安装 skill 的最小形状：

| 路径 | 角色 |
| --- | --- |
| `SKILL.md` | **唯一入口**。YAML `name` + `description` 是触发面；正文是触发后才加载的说明书，必须瘦。 |
| `agents/interface.yaml` | 中立元数据（显示名、兼容性），不绑死某一家客户端路径 |
| `references/` | 长文教义，禁止塞进 `SKILL.md` |
| `scripts/` | 可执行逻辑（评测、打包、校验） |
| `evals/` | trigger / packaging 用例（train / dev / holdout） |
| `reports/` | 证据与审阅页（HTML/JSON），不是运行时指令 |
| `examples/` | 示例入口用 `SKILL.example.md`，避免被递归发现成真 skill |

源仓自己的 `SKILL.md` 就是这份纪律的样板：Router Rules → Modes（Scaffold / Production / Library / Governed）→ Compact Workflow → Output Contract → 指向 `references/`。

## 4. 触发面（description）

Agent 是否启用某 skill，几乎只看 frontmatter `description`（含何时用、何时不用）。正文里的「When to use」帮不上路由。

Yao 把 description 当**可评测资产**：

- 正例 / 近邻 / 排除概念
- train 调、dev 排名、visible holdout 不回退、blind holdout 验收、adversarial holdout 防抢路由
- 改路由必须跑 `trigger_eval.py`，不能只改散文

Compact workflow 的第一刀：**没有「重复使用 + 可复用产出合同」就不要建 skill**（one-off / 纯翻译 / 纯总结 = no-skill，不写文件）。

## 5. 四种档位

| Mode | 用途 | 门禁厚度 |
| --- | --- | --- |
| Scaffold | 探索、个人草稿 | 最轻 |
| Production | 团队复用 | 接口 + 基础评测 |
| Library | 共享基建 | 兼容矩阵、资源边界 |
| Governed | 高信任 / 发布关键 | Skill IR、trust report、output scorecard、rollback、不许伪造证据 |

原则：**门禁按风险加，不按仪式加。** 先写瘦入口，结构只有「赚回成本」才加。

## 6. 方法教义（源仓 `references/`）

当作一等资产，不是散落注释：

- 工程方法、意图对话、参考扫描（只扫 3–5 个、默认沉默、只浮上冲突）
- 模式抽取、产出风险、写作纪律、skill 原型、门禁选择
- 非 skill 决策树、回归原因分类、人工审阅模板
- Skill IR / Output Eval / Review Studio / SkillOps 决策策略

意图对话：非核心缺口自行推断；每轮只问一个核心分叉，最多两轮；中文语气偏陪伴。

## 7. 评测与治理（理解边界即可）

源仓把「看起来像世界级」和「证据已接受」拆开：ledger 未闭合时，claim guard 会挡住公开完成表述。Harness 借鉴时只要记住：

- 评测是门禁，不是装饰
- 证据可以缺失，但必须标 `missing evidence`，禁止编造
- 遥测只收元数据（命令名 / 结果），不收原文和参数

## 8. 不读它的产品壳

以下是工厂自己的运营系统，**不是** Agent 运行时必需：Review Studio HTML、World-class ledger、Native Messaging telemetry host、zip 多端 packager、GitHub PR 诊断 CLI。借鉴开发时不要把这层搬进 wizard-harness 底座。

# Yao Meta Skill · 拆分

> 源仓：[yaojingang/yao-meta-skill](https://github.com/yaojingang/yao-meta-skill)  
> 成对文档：[理解](./understanding.md) · [HTML](./breakdown.html)  
> 用途：指导 `plugins/skills` 及后续 skill 工程化，不整仓搬 Python 工厂。

## 1. 模块切分（源仓 → 是否进 harness）

| 源仓模块 | 借鉴？ | 建议落点 | 说明 |
| --- | --- | --- | --- |
| `SKILL.md` 入口 + YAML `name`/`description` | **是** | 已有 `plugins/skills` 解析 | 触发面就是 description |
| 瘦入口 / `references/` / `scripts/` 分层 | **是** | 扫描与 `skill_read` | catalog 只注入短描述；全文按需读 |
| 非 skill 决策（one-off 不建包） | **是（纪律）** | 文档 + 未来 authoring 工具 | 不要自动从每段聊天生成 skill |
| `alwaysApply` vs 按需 | **是** | 已有 `setAlwaysApply` | 对应 Yao 的「核心准则进每轮」vs 路由触发 |
| 上下文预算（入口要瘦） | **是** | `CATALOG_CLIP` / `BODY_CLIP` | 可再暴露「超预算警告」 |
| trigger eval（正例/近邻/排除） | 可后补 | 新工具或 scripts 插件 | 不要在运行时默认跑 Python 套件 |
| Skill IR + 多端 compiler | **否（现阶段）** | — | harness 只服务本运行时，不导出 Claude/VS Code 包 |
| Review Studio / claim guard / world-class ledger | **否** | — | 发布治理壳 |
| 遥测 Native Host / JSONL 原文 | **否** | — | 隐私与产品壳 |
| `agents/interface.yaml` 中立元数据 | 可后补 | `SkillInfo` 扩展字段 | 显示名、兼容性，先不必 |
| 四种 Mode（scaffold…governed） | 可后补 | 清单或 config | 先当作者纪律，不当运行时枚举 |
| 器官化工具命名 | 部分 | `skill_list` / `skill_read` | 保持短动词；不要做成 CRUD 管理台 |

## 2. 与当前 `plugins/skills` 的差距

| 能力 | 现在 | Yao 要求 | 下一步可借 |
| --- | --- | --- | --- |
| 发现 | 扫 `~/.cursor/skills`、项目 `.cursor/skills` | 还区分 `.agents/skills`、disabled mirror | 扫描目录可配置（已有 `scanDirs`） |
| 路由 | 把 name+description 拼进 `skills:catalog` | description 必须含 include/exclude，且可评测 | 强化 catalog 文案：写清「何时不要用」 |
| 加载 | `skill_read` 拉全文 | 正文触发后才加载；细节在 references | 保持按需读；catalog 不要塞 body |
| 质量 | 无 | train/dev/holdout、blind、抢路由 | 可选：对仓库内 skill 跑静态检查（description 长度、是否含 Exclude） |
| 打包 | 无 | zip / 多端 adapter | 不需要；harness 直接读磁盘 |
| 治理 | enable / alwaysApply | owner、lifecycle、trust report | 弹窗保持开关即可 |

## 3. 建议吸收的切片（按优先级）

1. **触发面纪律**：`description` 必须同时写「做什么」和「不要在什么时候用」。catalog 注入沿用这句话，不要另写 When-to-use。
2. **分层**：鼓励仓库 skill 用 `SKILL.md` + `references/`；`skill_read` 只返回入口，需要时再读 references（可后加 `skill_read_ref`）。
3. **非 skill 闸门**：任何「从对话生成 skill」的工具，先问是否重复使用 + 是否有产出合同。
4. **上下文会计**：catalog 超长时截断并提示用 `skill_read`；与 prompt-context usage 对齐。
5. **静态门禁（薄）**：扫描时警告缺 description、body>N 行、把评测脚本误当入口。不要引入源仓整套 `yao.py`。

不要做：把 Review Studio、Skill IR 编译器、世界级证据账本、浏览器 Native Messaging 写进 core 或 skills 插件。

## 4. 与其它插件的边界

| 层 | 插件 | 不要用 Yao 填进去的东西 |
| --- | --- | --- |
| 身份基线 | `persona` | skill 不是 soul.md；不要把人格写进 SKILL.md |
| 经历记忆 | `memory` | skill 不是 breath 桶 |
| 本轮对话 | `session` | transcript 只是「生成 skill 的原料」，不是技能本身 |
| 能力包 | `skills` | 只发现与按需加载；工厂 CLI 留在源仓 |

## 5. 给后续实现的检查清单

- [ ] catalog 是否只含 id / name / description（触发面）？
- [ ] 全文是否必须 `skill_read` 才进上下文？
- [ ] 是否避免把 examples 目录的 `SKILL.md` 扫进来？（源仓用 `SKILL.example.md`）
- [ ] 新增 authoring 工具时是否先做 non-skill 判定？
- [ ] 改 `plugins/skills` 后是否同步 [docs](../../../docs/README.md) 与本文「差距」表？

## 6. 本地阅读源仓（可选）

```bash
git clone --depth 1 https://github.com/yaojingang/yao-meta-skill.git temp/yao-meta-skill
```

优先读：`SKILL.md`、`references/skill-engineering-method.md`、`references/resource-boundaries.md`、`references/non-skill-decision-tree.md`。其余 reports/ 与 scripts/ 是工厂自己的测试床。

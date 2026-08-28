# Reference projects

对照外部仓时吸收**数据模型 / 算法 / 产品哲学**，不整仓搬迁。每个子目录是一个参考项目，成对提供 html + md。

| 项目 | 源仓 | 对照能力 | 文档 | 状态 |
| --- | --- | --- | --- | --- |
| Ombre-Brain | [P0luz/Ombre-Brain](https://github.com/P0luz/Ombre-Brain) | 长期情绪记忆：桶、遗忘曲线、breath、器官化工具 | [理解](./ombre-brain/understanding.md) · [拆分](./ombre-brain/breakdown.md) | 已吸收 → `plugins/memory` |
| Yao Meta Skill | [yaojingang/yao-meta-skill](https://github.com/yaojingang/yao-meta-skill) | 可复用 Agent Skill 的工程化、评测、治理与跨端打包 | [理解](./yao-meta-skill/understanding.md) · [拆分](./yao-meta-skill/breakdown.md) | 待借鉴 → `plugins/skills` |

浏览页：[index.html](./index.html)

## 对照原则

1. **哲学优先于产品壳**：只搬「怎么写 / 怎么浮现 / 怎么触发 / 怎么评测」；MCP、Dashboard、OAuth、Telemetry Host 等部署壳不进底座。
2. **边界清晰**：`session` = 本轮说过什么；`persona` = 身份基线（soul.md）；`memory` = 跨会话经历；`skills` = 可发现的 SKILL.md 能力包。
3. **本地可跑**：默认无向量服务、无外部评测 SaaS 也能工作。
4. **分析与代码同步**：改对应插件时，更新该项目拆分文的「已落地」小节。

## 本地克隆（可选，勿提交）

```bash
git clone --depth 1 https://github.com/P0luz/Ombre-Brain.git temp/Ombre-Brain
git clone --depth 1 https://github.com/yaojingang/yao-meta-skill.git temp/yao-meta-skill
```

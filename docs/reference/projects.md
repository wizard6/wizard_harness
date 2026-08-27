# 参考项目列表

本仓库在设计能力插件时会对照外部项目，吸收其**数据模型 / 算法 / 产品哲学**，而不是整仓搬迁。

| 项目 | URL | 对照能力 | 分析文档 | 状态 |
| --- | --- | --- | --- | --- |
| **Ombre-Brain** | https://github.com/P0luz/Ombre-Brain | 长期情绪记忆：桶模型、遗忘曲线、breath 浮现、器官化工具 | [ombre-brain.md](./ombre-brain.md) | 已吸收 → `plugins/memory` |

## 对照原则

1. **哲学优先于产品壳**：保留记忆如何写入 / 浮现 / 淡去；MCP、Dashboard、OAuth、Tunnel 等部署壳不进底座。
2. **边界清晰**：`session` = 本轮说过什么；`persona` = 身份基线（soul.md，不管理记忆）；`memory` = 跨会话经历桶。
3. **本地可跑**：默认无向量服务也能工作；有 embedding provider 时再增强检索。
4. **分析文档与代码同步**：改 `plugins/memory` 行为时，同步更新本表对应分析页中的「已落地」小节。

## 本地克隆（可选）

开发时可浅克隆到仓库外或 `temp/`（勿提交）：

```bash
git clone --depth 1 https://github.com/P0luz/Ombre-Brain.git temp/Ombre-Brain
```

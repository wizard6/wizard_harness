# Reference projects

对照外部仓时吸收**数据模型 / 算法 / 产品哲学 / 合成模型**，不整仓搬迁。每个子目录是一个参考项目，成对提供 html + md。

| 项目 | 源仓 | 对照能力 | 文档 | 状态 |
| --- | --- | --- | --- | --- |
| Ombre-Brain | [P0luz/Ombre-Brain](https://github.com/P0luz/Ombre-Brain) | 长期情绪记忆：桶、遗忘曲线、breath、器官化工具 | [理解](./ombre-brain/understanding.md) · [拆分](./ombre-brain/breakdown.md) | 已吸收 → `plugins/memory` |
| Kando | [kando-menu/kando](https://github.com/kando-menu/kando) | 桌面扇形 / marking 菜单：方向选择、连续拖动手势 | [理解](./kando/understanding.md) · [拆分](./kando/breakdown.md) | **已暂停** → `plugins/pie-menu`（交互未达标） |
| Yao Meta Skill | [yaojingang/yao-meta-skill](https://github.com/yaojingang/yao-meta-skill) | 可复用 Agent Skill 的工程化、评测、治理与跨端打包 | [理解](./yao-meta-skill/understanding.md) · [拆分](./yao-meta-skill/breakdown.md) | 待借鉴 → `plugins/skills` |
| SAO Utils | [NERvGear/SAO-Utils](https://github.com/NERvGear/SAO-Utils) | 桌面 HUD 底层绘图：分层合成、场景图、动画插值（对照 [NERvSDK](https://github.com/NERvGear/NERvSDK)） | [理解](./sao-utils/understanding.md) · [拆分](./sao-utils/breakdown.md) | 待借鉴 → `obs/gui` 叠加层 |

浏览页：[index.html](./index.html)

## 对照原则

1. **哲学优先于产品壳**：只搬「怎么写 / 怎么浮现 / 怎么触发 / 怎么评测 / 怎么合成」；MCP、Dashboard、OAuth、Telemetry Host、Steam 工坊、QML 主题市场不进底座。
2. **边界清晰**：`session` = 本轮说过什么；`persona` = 身份基线（soul.md）；`memory` = 跨会话经历；`skills` = 可发现的 SKILL.md 能力包；桌面绘图 = 壳的叠加表面，不是插件 HWND。
3. **本地可跑**：默认无向量服务、无外部评测 SaaS、无 native D3D 宿主也能工作。
4. **分析与代码同步**：改对应插件或桌面壳时，更新该项目拆分文的「已落地」小节。
5. **绘图借模型不借引擎**：分层窗口、z / 命中、Canvas 场景图、属性插值；不搬 GDI/D3D9/OpenGL/Qt。

## 本地克隆（可选，勿提交）

```bash
git clone --depth 1 https://github.com/P0luz/Ombre-Brain.git temp/Ombre-Brain
git clone --depth 1 https://github.com/kando-menu/kando.git temp/kando
git clone --depth 1 https://github.com/yaojingang/yao-meta-skill.git temp/yao-meta-skill
git clone --depth 1 https://github.com/NERvGear/SAO-Utils.git temp/SAO-Utils
git clone --depth 1 https://github.com/NERvGear/NERvSDK.git temp/NERvSDK
```
# Kando · 拆分

> 源仓：[kando-menu/kando](https://github.com/kando-menu/kando)  
> 成对文档：[理解](./understanding.md) · [HTML](./breakdown.html)  
> 用途：指导 `plugins/pie-menu`；不做成第二个系统级 Kando。

## 1. 模块切分

| 源仓能力 | 是否借鉴 | 落点 | 说明 |
| --- | --- | --- | --- |
| 扇区点选（Fitts） | **是** | `plugins/pie-menu` | 扇区内任意点有效 |
| Marking 连续拖动手势 | **是（优先）** | 同左 | 按住拖入子菜单、松手激活 |
| 进子菜单**开花绽放**（非硬切） | **是** | 同左 | 旧层淡出放大，新层错开绽开 |
| 进子菜单后原点跟手 | 弱化 | 同左 | 先保开花感；跟手可再开 |
| Turbo / Hover | 推迟 | — | 先把 marking 做稳 |
| 全局热键 / 托盘唤出 | 部分 | 托盘 `Pie Menu` | 全局热键属 OS，后议 |
| 启动外部 App / 键鼠宏 | **否** | — | 超出 harness 壳边界 |
| 菜单编辑器 / 主题市场 | **否** | `registerItem` API | 用代码登记即可 |
| 多显示器 / 触控板手势 | 推迟 | — | 先单显示器工作区 |

## 2. 映射

| Kando | harness |
| --- | --- |
| menus.json 树 | `PieMenuItem` + `setRoot` / `registerItem` |
| command 叶子 | `openPlugin` / `action` |
| submenu | `kind: 'submenu'` + 手势进入 |
| 透明全屏 HUD | **实色遮罩层**（Windows 透明窗不可靠） |

## 3. 已落地（`plugins/pie-menu`）

- 实色全屏层 + 菜单树服务 + 托盘入口
- marking / 开花过渡的试验实现

## 4. 状态：**已暂停**（2026-08-30）

视觉与开花手势未达到可用标准；参考文档保留，插件可留在 bundle，但暂不继续打磨。恢复时优先：Kando 级开花动效与材质，而不是再叠功能。

## 5. 刻意推迟

- 系统全局热键、启动任意 exe、模拟快捷键
- Hover 自动选、完整 zig-zag 折转检测
- 可视化菜单编辑器与主题

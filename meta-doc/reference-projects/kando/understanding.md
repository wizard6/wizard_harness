# Kando · 理解

> 源仓：[kando-menu/kando](https://github.com/kando-menu/kando) · 站点：[kando.menu](https://kando.menu/)  
> 成对文档：[拆分](./breakdown.md) · [HTML](./understanding.html)  
> 本地副本可放 `temp/kando`（不入库）。

## 1. 它是什么

跨平台**桌面扇形菜单（pie / marking menu）**：用方向选择代替点小按钮。热键或鼠标唤出后，整屏成为点击/拖拽目标；嵌套子菜单靠**一条连续手势**穿过，追求肌肉记忆速度（Fitts 法则 + marking menu）。

## 2. 交互模型（要借的核心）

| 模式 | 行为 | 为何快 |
| --- | --- | --- |
| Point-and-click | 点扇区任意处 | 目标在运动方向上被放大 |
| **Marking** | 按住拖过扇区；折转或松手选定 | 一层手势可进多层子菜单 |
| Turbo | 唤出热键不放 ≈ 按住左键 | 键鼠协同，少一次按下 |
| Hover | 停在扇区即选（可选） | 最快，也易误触 |

关键体验：**按住拖动 → 进入子菜单时菜单跟到手势 → 松手激活叶子**。不是「点一下、等一下、再点一下」。

## 3. 信息架构

- 菜单树：根 → submenu → 叶子（command / URI / hotkey / …）
- 单层建议 ≤ 8～12 项；深嵌套优于宽扇区
- 可选固定角度锁，方便记「向右再向上」这类路径

## 4. 与 harness 的边界

Kando 是 **OS 级** 启动器（全局热键、启动 App、模拟按键）。wizard-harness 只借**交互几何与 marking 手势**，落点是壳内快捷打开插件 / 发 action，不复制系统宏与全局钩子。

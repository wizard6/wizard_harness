/**
 * 插件分类标签（manifest.tags / package.json wizardHarness.tags）。
 *
 * - **工具套件**：向 `tools` 登记能力、工作区边界、prompt-context 说明。
 *   新插件请参考 `dev-tools` / `git-tools`，勿照搬 `toolbox` 的脚本配置模式。
 * - **工具盒**：配置驱动脚本 / 按钮，`box.*` 工具。参考 `toolbox`。
 */
export const PLUGIN_TAG_TOOLKIT = '工具套件' as const;
export const PLUGIN_TAG_SCRIPT_BOX = '工具盒' as const;

export type KnownPluginTag = typeof PLUGIN_TAG_TOOLKIT | typeof PLUGIN_TAG_SCRIPT_BOX;

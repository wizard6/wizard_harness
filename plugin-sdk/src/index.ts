/**
 * @wizard-harness/plugin-sdk
 *
 * 外部插件作者只需依赖本包（而非直接散引 core + contracts）。
 * 运行时仍由宿主加载 dist/index.js 插件入口。
 */
import '@wizard-harness/contracts';

export type {
  Plugin,
  PluginContext,
  PluginManifest,
  PluginUi,
  InjectSpec,
  ProvideSpec,
  RegisterOptions,
  RegisteredPlugin,
  ReloadResult,
  ServiceAccess,
} from '@wizard-harness/core';

export {
  DuplicatePluginError,
  InvalidPluginError,
  PluginNotFoundError,
  normalizeInject,
  normalizeProvides,
  providedServices,
} from '@wizard-harness/core';

export * from '@wizard-harness/contracts';

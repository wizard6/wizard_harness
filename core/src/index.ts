export { createEventBus } from './events/bus.js';
export type { EventBus, EventSink, Unsubscribe } from './events/bus.js';
export { createDispatcher } from './events/dispatcher.js';
export type { Dispatcher, DispatcherEvents } from './events/dispatcher.js';
export type { PluginEvent } from './events/types.js';
export { createFileSink } from './events/persistence.js';
export { queryEvents, readEvents, tailEvents } from './events/reader.js';
export type { EventQuery } from './events/reader.js';

export {
  DuplicatePluginError,
  InvalidPluginError,
  PluginNotFoundError,
  RegistrarError,
} from './registrar/errors.js';
export { createRegistrar } from './registrar/registrar.js';
export type { CreateRegistrarOptions } from './registrar/registrar.js';
export { discoverPlugins } from './discovery.js';
export type { DiscoverOptions, DiscoverResult } from './discovery.js';
export { createHarness } from './harness.js';
export type { BootResult, CreateHarnessOptions, SystemContext, SystemStatus } from './harness.js';
export { assembleRuntime } from './shell.js';
export type {
  AssembleRuntimeOptions,
  AssembleRuntimeResult,
  RuntimeSkipped,
} from './shell.js';
export { bootPlugins, missingInjectInBatch, sortByInject } from './registrar/boot.js';
export type {
  InjectEntry,
  InjectSpec,
  Plugin,
  PluginContext,
  PluginManifest,
  PluginUi,
  ProvideSpec,
  ProvidedEntry,
  RegisterOptions,
  RegisteredPlugin,
  ReloadResult,
  Registrar,
  ServiceAccess,
  ServiceBinding,
  ServiceLifetime,
  ServiceRegisterOptions,
  ServiceRegistry,
  ServiceScope,
} from './registrar/types.js';
export {
  isBindingVisible,
  normalizeInject,
  normalizeProvides,
  providedServices,
} from './registrar/types.js';


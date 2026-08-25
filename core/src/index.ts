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
export { assembleRuntime, syncRuntime } from './shell.js';
export type {
  AssembleRuntimeOptions,
  AssembleRuntimeResult,
  RuntimeSkipped,
  SyncRuntimeOptions,
  SyncRuntimeResult,
} from './shell.js';
export {
  PATCH_FILENAME,
  applyEntryPatches,
  composeLayers,
  loadBundle,
  loadPatchFile,
  loadProfile,
  parsePatchList,
  resolveBundleDir,
  resolveHomeDir,
  resolveProfileDir,
} from './profile/index.js';
export { readHomePatch, upsertHomePatch } from './profile/save.js';
export type {
  ApplyPatchesResult,
  CompositionSnapshot,
  LoadProfileOptions,
  LoadedBundle,
  PatchOptions,
  PluginEntry,
} from './profile/index.js';
export { bootPlugins, missingInjectInBatch, sortByInject } from './registrar/boot.js';
export {
  bindScopeParent,
  createScope,
  isScopeCarrier,
  scopeAdmits,
  scopeChainOf,
  scopeOf,
  scopeParentOf,
  scopeTarget,
  AnonymousEntries,
  NamedEntries,
  ScopedLayers,
} from './scope/index.js';
export type { CreateScopeOptions, Scope, ScopeKey, ScopeLayer, ScopeParentBinding, Scoped } from './scope/index.js';
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
} from './registrar/types.js';
export { normalizeInject, normalizeProvides, providedServices } from './registrar/types.js';
export { CascadeRestoreBook } from './cascade-restore.js';
export type { CascadeRestoreSnapshot } from './cascade-restore.js';
export { bootDiscoveredPlugins } from './shell.js';


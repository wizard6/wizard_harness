export { createEventBus } from './events/bus.js';
export type { EventBus, EventSink, Unsubscribe } from './events/bus.js';
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
export type {
  Plugin,
  PluginContext,
  PluginManifest,
  PluginUi,
  RegisteredPlugin,
  Registrar,
} from './registrar/types.js';

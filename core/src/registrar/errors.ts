export class RegistrarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrarError';
  }
}

/** 插件 id 重复 */
export class DuplicatePluginError extends RegistrarError {
  constructor(public readonly pluginId: string) {
    super(`插件已注册：${pluginId}`);
    this.name = 'DuplicatePluginError';
  }
}

/** 插件定义非法（缺 manifest 或 register） */
export class InvalidPluginError extends RegistrarError {
  constructor(message: string) {
    super(`非法插件：${message}`);
    this.name = 'InvalidPluginError';
  }
}

/** 插件未注册 */
export class PluginNotFoundError extends RegistrarError {
  constructor(public readonly pluginId: string) {
    super(`插件未注册：${pluginId}`);
    this.name = 'PluginNotFoundError';
  }
}

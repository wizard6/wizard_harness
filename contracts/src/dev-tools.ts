/**
 * 服务契约层：devTools 服务。
 *
 * 本地编程工作区：文件工具不出 root；bash 的 cwd 是 root，但命令本身不是路径笼子。
 * 模型入口只走 tools.register 出去的工具，不要让 loop 直接 fs / spawn。
 */
export const DEV_TOOLS_SERVICE = 'devTools';

export interface DevToolsInfo {
  readonly root: string;
  readonly tools: readonly string[];
}

export interface DevToolsService {
  info(): DevToolsInfo;
}

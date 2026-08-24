/**
 * 服务契约层：webTools 服务。
 *
 * 网页搜索与阅读。模型入口只走 tools.register；弹窗只暴露 info。
 * 省 token：先 outline，再按 heading / offset 读一截；markdown 保留结构，text 去掉。
 */
export const WEB_TOOLS_SERVICE = 'webTools';

export interface WebToolsInfo {
  readonly engine: string;
  readonly tools: readonly string[];
  readonly cacheEntries: number;
}

export interface WebToolsService {
  info(): WebToolsInfo;
}

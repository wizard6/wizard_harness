/** 与 contracts 保持一致；插件内定义以避免 contracts dist 未构建时加载失败 */
export const GIT_TOOLS_SERVICE = 'gitTools';

export function gitToolName(action: string): string {
  return `git.${action.trim()}`;
}

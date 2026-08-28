/**
 * 无 Electron 的 Web 开发运行时：API 壳 + 工作台浏览器 UI + /site 已部署站。
 * 用法：在仓库根 `pnpm web-dev`
 */
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { WEB_DEV_EXPOSE } from '../obs/api/src/expose.js';

const cwd = process.cwd();
process.env.WH_PROFILE ||= 'web-dev';
process.env.WH_STATIC_DIR ||= resolve(cwd, 'plugins/workspace/web');
const home = process.env.WH_HOME?.trim() || resolve(homedir(), '.wizard-harness');
process.env.WH_SITE_DIR ||= resolve(home, 'web-deploy');
if (!process.env.WH_EXPOSE?.trim()) {
  process.env.WH_EXPOSE = JSON.stringify(WEB_DEV_EXPOSE);
}

await import('../obs/api/src/main.js');

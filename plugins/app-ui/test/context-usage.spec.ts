import { describe, expect, it } from 'vitest';
import { APP_UI_HTML } from '../src/page.js';
import { CONTEXT_USAGE_JS } from '../src/context-usage.js';
import { TRAJECTORY_VIEW_JS } from '../src/traj-view.js';

describe('context-usage UI', () => {
  it('内联脚本可解析', () => {
    expect(() => new Function(`${TRAJECTORY_VIEW_JS}${CONTEXT_USAGE_JS}`)).not.toThrow();
  });

  it('弹窗在 app 容器外且默认隐藏', () => {
    expect(APP_UI_HTML).toContain('class="ctx-modal"');
    expect(APP_UI_HTML).toContain('bindContextUsageUi');
    expect(APP_UI_HTML).toMatch(/<\/div><\/div><div class="ctx-modal"/);
  });
});

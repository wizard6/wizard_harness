import { CONTEXT_MENU_CSS, CONTEXT_MENU_HTML, CONTEXT_MENU_JS } from '@wizard-harness/plugin-code-browser/context-menu';
import { FILE_SYNC_JS } from '@wizard-harness/plugin-code-browser/file-sync';
import { SYNTAX_CSS, SYNTAX_JS } from '@wizard-harness/plugin-code-browser/syntax';
import { CODE_VIEW_CHROME_CSS } from '@wizard-harness/plugin-code-browser/view-chrome';
import { CODE_EDITOR_HTML as buildEditorHtml } from './page-body.js';

export const CODE_EDITOR_HTML = buildEditorHtml({
  chromeCss: CODE_VIEW_CHROME_CSS,
  contextMenuCss: CONTEXT_MENU_CSS,
  syntaxCss: SYNTAX_CSS,
  contextMenuHtml: CONTEXT_MENU_HTML,
  syntaxJs: SYNTAX_JS,
  contextMenuJs: CONTEXT_MENU_JS,
  fileSyncJs: FILE_SYNC_JS,
});

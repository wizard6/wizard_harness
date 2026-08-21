export const APP_UI_SERVICE = 'appUi';

/** 产品面：薄壳窗口。不拥有 session/llm/loop，只打开聊天面。 */
export interface AppUiService {
  readonly title: string;
}

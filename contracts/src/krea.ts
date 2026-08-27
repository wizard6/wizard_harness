/**
 * 服务契约层：krea 服务。
 *
 * 接入 Krea REST API（https://api.krea.ai）。模型入口只走 tools.register；
 * 弹窗只暴露 info。API Key 由 WH_KREA_API_KEY 或插件 config.apiKey 提供。
 */
export const KREA_SERVICE = 'krea';

export interface KreaModelInfo {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly family: 'k2' | 'size';
}

export interface KreaJobView {
  readonly job_id: string;
  readonly status: string;
  readonly model: string;
  readonly prompt?: string;
  readonly urls: readonly string[];
  readonly error?: string;
  readonly hint?: string;
}

export interface KreaInfo {
  readonly configured: boolean;
  readonly defaultModel: string;
  readonly tools: readonly string[];
  readonly models: readonly KreaModelInfo[];
  readonly recent: readonly KreaJobView[];
}

export interface KreaGenerateInput {
  readonly prompt: string;
  readonly model?: string;
  readonly aspect_ratio?: string;
  readonly resolution?: string;
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly creativity?: string;
  readonly image_url?: string;
  readonly strength?: number;
  readonly wait?: boolean;
}

export interface KreaService {
  info(): KreaInfo;
  models(): readonly KreaModelInfo[];
  generate(input: KreaGenerateInput): Promise<KreaJobView>;
  job(jobId: string): Promise<KreaJobView>;
}

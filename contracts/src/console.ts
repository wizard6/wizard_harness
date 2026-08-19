/**
 * 服务契约层：console 服务（shell 命令执行，Agent 基座的"手"）。
 */
export const CONSOLE_SERVICE = 'console';

/** 命令执行结果 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** console 服务接口：执行 shell 命令 */
export interface ConsoleService {
  exec(command: string, opts?: { timeoutMs?: number }): Promise<ExecResult>;
}

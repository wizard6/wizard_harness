/**
 * 服务契约层：logger 服务。
 *
 * 契约属于系统而非任何插件：服务名 'logger' 与 LoggerService 接口在此绑定。
 * 任何插件都可提供或替换该服务的实现——提供方只是实现者，不拥有契约。
 * 消费方 import LoggerService 即可获得完整类型，无需猜测服务形状。
 */
export const LOGGER_SERVICE = 'logger';

/** logger 服务接口：写日志文件 + 广播观测事件 */
export interface LoggerService {
  /** 按级别写一行日志；低于当前级别返回空串。返回格式化后的日志行 */
  log(level: string, msg: string): string;
  debug(msg: string): string;
  info(msg: string): string;
  warn(msg: string): string;
  error(msg: string): string;
  /** 调整当前级别阈值（debug < info < warn < error） */
  setLevel(level: string): void;
  getLevel(): string;
  /** 当前日志文件路径 */
  getFile(): string;
}

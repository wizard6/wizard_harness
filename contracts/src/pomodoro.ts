/**
 * 服务契约层：pomodoro 服务。
 *
 * 番茄钟：专注 / 短休 / 长休状态机，供弹窗 UI 与托盘入口使用。
 */
export const POMODORO_SERVICE = 'pomodoro';

export type PomodoroPhase = 'idle' | 'focus' | 'shortBreak' | 'longBreak';

export interface PomodoroConfig {
  readonly focusMinutes: number;
  readonly shortBreakMinutes: number;
  readonly longBreakMinutes: number;
  readonly longBreakEvery: number;
}

export interface PomodoroState {
  readonly phase: PomodoroPhase;
  readonly remainingMs: number;
  readonly completedFocus: number;
  readonly running: boolean;
  readonly paused: boolean;
  readonly config: PomodoroConfig;
}

export type PomodoroConfigurePatch = Partial<PomodoroConfig>;

export interface PomodoroService {
  snapshot(): PomodoroState;
  start(): PomodoroState;
  pause(): PomodoroState;
  resume(): PomodoroState;
  reset(): PomodoroState;
  skip(): PomodoroState;
  configure(patch: PomodoroConfigurePatch): PomodoroState;
}

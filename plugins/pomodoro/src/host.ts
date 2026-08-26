import type {
  PomodoroConfig,
  PomodoroConfigurePatch,
  PomodoroPhase,
  PomodoroState,
} from '@wizard-harness/contracts';

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
};

function msFromMinutes(minutes: number): number {
  return Math.max(0, minutes) * 60_000;
}

function phaseDuration(phase: PomodoroPhase, config: PomodoroConfig): number {
  switch (phase) {
    case 'focus':
      return msFromMinutes(config.focusMinutes);
    case 'shortBreak':
      return msFromMinutes(config.shortBreakMinutes);
    case 'longBreak':
      return msFromMinutes(config.longBreakMinutes);
    default:
      return 0;
  }
}

function cloneState(state: MutableState): PomodoroState {
  return {
    ...state,
    config: { ...state.config },
  };
}

type MutableState = {
  phase: PomodoroPhase;
  remainingMs: number;
  completedFocus: number;
  running: boolean;
  paused: boolean;
  config: PomodoroConfig;
};

export function createPomodoroHost(initial?: Partial<PomodoroConfig>) {
  let state: MutableState = {
    phase: 'idle',
    remainingMs: 0,
    completedFocus: 0,
    running: false,
    paused: false,
    config: { ...DEFAULT_POMODORO_CONFIG, ...initial },
  };

  function snapshot(): PomodoroState {
    return cloneState(state);
  }

  function enterPhase(phase: PomodoroPhase): void {
    state.phase = phase;
    state.remainingMs = phase === 'idle' ? 0 : phaseDuration(phase, state.config);
    if (phase === 'idle') {
      state.running = false;
      state.paused = false;
    }
  }

  function advancePhase(): void {
    if (state.phase === 'focus') {
      state.completedFocus += 1;
      const longNext =
        state.config.longBreakEvery > 0 &&
        state.completedFocus % state.config.longBreakEvery === 0;
      enterPhase(longNext ? 'longBreak' : 'shortBreak');
      return;
    }
    if (state.phase === 'shortBreak' || state.phase === 'longBreak') {
      enterPhase('focus');
      return;
    }
    enterPhase('idle');
  }

  function tick(ms = 1000): void {
    if (!state.running || state.paused || state.phase === 'idle') return;
    state.remainingMs = Math.max(0, state.remainingMs - ms);
    if (state.remainingMs <= 0) advancePhase();
  }

  return {
    snapshot,
    tick,
    start(): PomodoroState {
      if (state.phase === 'idle') enterPhase('focus');
      state.running = true;
      state.paused = false;
      return snapshot();
    },
    pause(): PomodoroState {
      state.paused = true;
      return snapshot();
    },
    resume(): PomodoroState {
      if (state.phase !== 'idle') state.running = true;
      state.paused = false;
      return snapshot();
    },
    reset(): PomodoroState {
      const config = { ...state.config };
      state = {
        phase: 'idle',
        remainingMs: 0,
        completedFocus: 0,
        running: false,
        paused: false,
        config,
      };
      return snapshot();
    },
    skip(): PomodoroState {
      if (state.phase === 'idle') return snapshot();
      advancePhase();
      return snapshot();
    },
    configure(patch: PomodoroConfigurePatch): PomodoroState {
      state.config = { ...state.config, ...patch };
      if (state.phase !== 'idle') {
        const cap = phaseDuration(state.phase, state.config);
        state.remainingMs = Math.min(state.remainingMs, cap);
      }
      return snapshot();
    },
  };
}

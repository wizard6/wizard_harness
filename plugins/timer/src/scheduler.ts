/** 单 wake 定时器：按最近触发时刻调度，避免每任务一个 setInterval */
export type WakeHandler = (now: number) => void;

export class JobScheduler {
  private wake: ReturnType<typeof setTimeout> | undefined;
  private readonly nextAt = new Map<string, number>();
  private nearest = Infinity;

  constructor(private readonly onWake: WakeHandler) {}

  set(jobId: string, at: number): void {
    if (!Number.isFinite(at) || at <= 0) {
      this.nextAt.delete(jobId);
    } else {
      this.nextAt.set(jobId, at);
    }
    this.replan();
  }

  remove(jobId: string): void {
    this.nextAt.delete(jobId);
    this.replan();
  }

  clear(): void {
    this.nextAt.clear();
    if (this.wake) clearTimeout(this.wake);
    this.wake = undefined;
    this.nearest = Infinity;
  }

  peekWakeAt(): number | null {
    return Number.isFinite(this.nearest) && this.nearest < Infinity ? this.nearest : null;
  }

  due(now: number): string[] {
    const ids: string[] = [];
    for (const [id, at] of this.nextAt) {
      if (at <= now) ids.push(id);
    }
    return ids;
  }

  private replan(): void {
    let nearest = Infinity;
    for (const at of this.nextAt.values()) nearest = Math.min(nearest, at);
    this.nearest = nearest;
    if (this.wake) clearTimeout(this.wake);
    this.wake = undefined;
    if (!Number.isFinite(nearest) || nearest >= Infinity) return;
    const delay = Math.max(0, nearest - Date.now());
    this.wake = setTimeout(() => this.onWake(Date.now()), delay);
  }
}

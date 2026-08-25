/** 轻量 cron 下一触发时刻（5 段：分 时 日 月 周，UTC） */
const RE = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/;

function parseField(part: string, min: number, max: number): (n: number) => boolean {
  if (part === '*') return () => true;
  const out = new Set<number>();
  for (const chunk of part.split(',')) {
    const stepM = /^(.+)\/(\d+)$/.exec(chunk);
    const base = stepM ? stepM[1]! : chunk;
    const step = stepM ? Math.max(1, Number(stepM[2]) || 1) : 1;
    if (base.includes('-')) {
      const [a, b] = base.split('-').map(Number);
      const lo = Math.max(min, a || min);
      const hi = Math.min(max, b || max);
      for (let i = lo; i <= hi; i += step) out.add(i);
    } else {
      const n = Number(base);
      if (Number.isFinite(n)) {
        for (let i = n; i <= max; i += step) out.add(i);
      }
    }
  }
  return (n) => out.has(n);
}

export function nextCronFire(expr: string, afterMs: number): number {
  const m = RE.exec(expr.trim());
  if (!m) throw new Error(`非法 cron：${expr}`);
  const matchMin = parseField(m[1]!, 0, 59);
  const matchHour = parseField(m[2]!, 0, 23);
  const matchDom = parseField(m[3]!, 1, 31);
  const matchMon = parseField(m[4]!, 1, 12);
  const matchDow = parseField(m[5]!, 0, 6);

  const start = new Date(afterMs + 1);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  for (let i = 0; i < 366 * 24 * 60; i += 1) {
    const min = start.getUTCMinutes();
    const hour = start.getUTCHours();
    const dom = start.getUTCDate();
    const mon = start.getUTCMonth() + 1;
    const dow = start.getUTCDay();
    if (matchMin(min) && matchHour(hour) && matchDom(dom) && matchMon(mon) && matchDow(dow)) {
      return start.getTime();
    }
    start.setUTCMinutes(start.getUTCMinutes() + 1);
  }
  throw new Error(`cron 一年内无匹配：${expr}`);
}

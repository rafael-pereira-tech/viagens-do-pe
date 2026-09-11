export async function waitMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  const scheduler = (globalThis as { scheduler?: { wait?: (ms: number) => Promise<void> } }).scheduler;
  if (scheduler?.wait) {
    await scheduler.wait(ms);
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseRetryAfterMs(header: string | null, fallbackMs: number): number {
  if (!header) return fallbackMs;
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return asInt > 1_000_000 ? asInt : asInt * 1000;
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return fallbackMs;
}

export class SequentialLimiter {
  private lastAt = 0;

  constructor(
    private readonly delayMs: number,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly now: () => number,
  ) {}

  async waitTurn(): Promise<void> {
    if (this.delayMs <= 0) return;
    const elapsed = this.now() - this.lastAt;
    if (this.lastAt > 0 && elapsed < this.delayMs) {
      await this.sleep(this.delayMs - elapsed);
    }
    this.lastAt = this.now();
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

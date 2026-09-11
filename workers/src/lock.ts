/**
 * Isolate-local skip-if-running lock. Complements the Postgres singleton
 * `ingest_runs` running index so a cron tick and POST /run in the same
 * Worker isolate cannot overlap.
 */
export class SkipIfRunningLock {
  private holder: string | null = null;

  tryAcquire(runId: string): boolean {
    if (this.holder) return false;
    this.holder = runId;
    return true;
  }

  release(runId: string): void {
    if (this.holder === runId) this.holder = null;
  }

  get heldBy(): string | null {
    return this.holder;
  }
}

export const isolateLock = new SkipIfRunningLock();

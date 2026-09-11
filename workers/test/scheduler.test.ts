import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CollectParams, CollectResult, Snapshot } from '../src/collectors/types.ts';
import { SkipIfRunningLock } from '../src/lock.ts';
import { runIngest } from '../src/scheduler.ts';
import type { IngestRunFinish, IngestRunStart, SnapshotStore } from '../src/supabase.ts';
import { toSnapshotRow } from '../src/supabase.ts';

interface MemoryRun extends IngestRunStart {
  status: string;
  finished_at: string | null;
  snapshot_count: number;
  job_count: number;
  error_message: string | null;
  details: unknown;
}

function memoryStore() {
  const snapshots: Snapshot[] = [];
  const runs: MemoryRun[] = [];
  let running: MemoryRun | null = null;

  const store: SnapshotStore = {
    async expireStaleRuns(nowIso) {
      if (running && running.lease_expires_at < nowIso) {
        running.status = 'scrape_failed';
        running.finished_at = nowIso;
        running.error_message = 'lease expired before completion';
        running = null;
        return 1;
      }
      return 0;
    },
    async beginRun(run) {
      if (running) return { acquired: false, reason: 'already_running' };
      const row: MemoryRun = {
        ...run,
        status: 'running',
        finished_at: null,
        snapshot_count: 0,
        job_count: 0,
        error_message: null,
        details: { phase: 'started' },
      };
      running = row;
      runs.push(row);
      return { acquired: true };
    },
    async insertSnapshots(rows) {
      for (const row of rows) toSnapshotRow(row);
      snapshots.push(...rows);
      return rows.length;
    },
    async finishRun(id, patch: IngestRunFinish) {
      const row = runs.find((r) => r.id === id);
      if (!row || row.status !== 'running') return false;
      row.status = patch.status;
      row.finished_at = patch.finished_at;
      row.snapshot_count = patch.snapshot_count;
      row.job_count = patch.job_count;
      row.error_message = patch.error_message;
      row.details = patch.details;
      if (running?.id === id) running = null;
      return true;
    },
  };

  return { store, snapshots, runs };
}

const now = new Date('2026-09-11T12:00:00Z');

function baseDeps(store: SnapshotStore) {
  return {
    env: {},
    cron: '0 12 * * *',
    scheduledTime: now,
    now,
    store,
    lock: new SkipIfRunningLock(),
  };
}

describe('runIngest', () => {
  it('runs the full matrix; unconfigured Smiles, TudoAzul, and LATAM Pass are auth_failed', async () => {
    const { store, snapshots, runs } = memoryStore();
    const summary = await runIngest({ ...baseDeps(store), cron: '0 12 * * *' });

    assert.equal(summary.skipped, false);
    assert.equal(summary.status, 'auth_failed');
    assert.equal(summary.jobCount, 122 * 4);
    assert.equal(summary.snapshotCount, 0);
    assert.equal(summary.persisted, true);
    assert.equal(summary.routes.length, 4);
    const smilesRoute = summary.routes.find((r) => r.program === 'smiles');
    assert.equal(smilesRoute?.status, 'auth_failed');
    assert.equal(smilesRoute?.origin, 'PET');
    assert.equal(smilesRoute?.destination, 'CGH');
    const azulRoutes = summary.routes.filter((r) => r.program === 'tudoazul');
    assert.equal(azulRoutes.length, 2);
    assert.ok(azulRoutes.every((r) => r.status === 'auth_failed'));
    assert.deepEqual(azulRoutes.map((r) => r.destination).sort(), ['POA', 'VCP']);
    const latamRoute = summary.routes.find((r) => r.program === 'latam_pass');
    assert.equal(latamRoute?.status, 'auth_failed');
    assert.equal(latamRoute?.destination, 'GRU');
    assert.equal(summary.failures.length, 122 * 4);
    assert.ok(summary.failures.every((f) => f.status === 'auth_failed'));
    assert.ok(summary.runId);
    assert.equal(summary.collectedAt, now.toISOString());
    assert.equal(snapshots.length, 0);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.status, 'auth_failed');
    assert.equal(runs[0]!.cron, '0 12 * * *');
    assert.equal(runs[0]!.collected_at, summary.collectedAt);
  });

  it('skips persistence when Supabase env is missing or a placeholder', async () => {
    const summary = await runIngest({
      env: {
        SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'your-service-role-key',
      },
      cron: 'manual',
      scheduledTime: now,
      now,
      lock: new SkipIfRunningLock(),
    });
    assert.equal(summary.skipped, false);
    assert.equal(summary.status, 'auth_failed');
    assert.equal(summary.persisted, false);
    assert.equal(summary.jobCount, 122 * 4);
  });

  it('stamps collected_at and ingest_run_id on every snapshot write', async () => {
    const { store, snapshots, runs } = memoryStore();
    const collect = async (params: CollectParams): Promise<CollectResult> => {
      if (params.destination !== 'CGH' || params.flightDate !== '2026-09-01') {
        return { status: 'empty', snapshots: [] };
      }
      return {
        status: 'success',
        snapshots: [
          {
            origin: params.origin,
            destination: params.destination,
            airline: params.airline,
            program: params.program,
            flight_date: params.flightDate,
            miles: 12000,
            taxes_brl: 90.5,
            currency: 'BRL',
            source: 'test:smiles',
            raw_payload: { stub: true },
          },
        ],
      };
    };

    const summary = await runIngest({ ...baseDeps(store), cron: 'manual', collect });

    assert.equal(summary.skipped, false);
    assert.equal(summary.status, 'success');
    assert.equal(summary.snapshotCount, 1);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]!.miles, 12000);
    assert.equal(snapshots[0]!.ingest_run_id, summary.runId);
    assert.equal(snapshots[0]!.collected_at, summary.collectedAt);
    assert.equal(runs[0]!.status, 'success');
    assert.equal(runs[0]!.id, summary.runId);
  });

  it('does not mark the run successful when any job fails', async () => {
    const { store, runs } = memoryStore();
    const collect = async (params: CollectParams): Promise<CollectResult> => {
      if (params.destination === 'GRU' && params.flightDate === '2026-09-01') {
        throw new Error('boom');
      }
      return { status: 'empty', snapshots: [] };
    };

    const summary = await runIngest({ ...baseDeps(store), cron: 'manual', collect });

    assert.equal(summary.status, 'partial');
    assert.notEqual(summary.status, 'success');
    assert.equal(summary.failures.length, 1);
    assert.equal(summary.failures[0]!.status, 'scrape_failed');
    assert.equal(summary.failures[0]!.error, 'boom');
    assert.equal(runs[0]!.status, 'partial');
  });

  it('skips an overlapping tick and never records it as success', async () => {
    const { store, runs, snapshots } = memoryStore();
    const held = await store.beginRun({
      id: '00000000-0000-0000-0000-000000000099',
      started_at: now.toISOString(),
      collected_at: now.toISOString(),
      lease_expires_at: new Date(now.getTime() + 60_000).toISOString(),
      cron: '0 6 * * *',
    });
    assert.equal(held.acquired, true);

    const summary = await runIngest(baseDeps(store));

    assert.equal(summary.skipped, true);
    assert.equal(summary.skipReason, 'already_running');
    assert.equal(summary.status, null);
    assert.notEqual(summary.status, 'success');
    assert.equal(summary.persisted, false);
    assert.equal(snapshots.length, 0);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.id, '00000000-0000-0000-0000-000000000099');
    assert.equal(runs[0]!.status, 'running');
  });

  it('skips a second in-isolate tick without writing success', async () => {
    const lock = new SkipIfRunningLock();
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const collect = async (): Promise<CollectResult> => {
      entered();
      await gate;
      return { status: 'empty', snapshots: [] };
    };

    const first = runIngest({
      env: {},
      cron: '0 12 * * *',
      scheduledTime: now,
      now,
      collect,
      store: null,
      lock,
    });
    await started;
    const second = await runIngest({
      env: {},
      cron: '0 18 * * *',
      scheduledTime: now,
      now,
      collect,
      store: null,
      lock,
    });
    assert.equal(second.skipped, true);
    assert.equal(second.status, null);
    release();
    const firstSummary = await first;
    assert.equal(firstSummary.skipped, false);
    assert.equal(firstSummary.status, 'empty');
  });

  it('reaps a stale running lease as scrape_failed, not success', async () => {
    const { store, runs } = memoryStore();
    const staleNow = new Date('2026-09-11T11:00:00Z');
    await store.beginRun({
      id: '00000000-0000-0000-0000-000000000001',
      started_at: staleNow.toISOString(),
      collected_at: staleNow.toISOString(),
      lease_expires_at: new Date('2026-09-11T11:10:00Z').toISOString(),
      cron: '0 6 * * *',
    });

    const summary = await runIngest(baseDeps(store));

    assert.equal(summary.skipped, false);
    assert.equal(summary.status, 'auth_failed');
    const stale = runs.find((r) => r.id === '00000000-0000-0000-0000-000000000001');
    assert.equal(stale?.status, 'scrape_failed');
    assert.notEqual(stale?.status, 'success');
    assert.equal(runs.at(-1)?.status, 'auth_failed');
  });

  it('persists Smiles dry-run PET→CGH snapshots for a one-day window', async () => {
    const { store, snapshots, runs } = memoryStore();
    const summary = await runIngest({
      ...baseDeps(store),
      env: {
        SMILES_DRY_RUN: '1',
        FLIGHT_WINDOW_START: '2026-09-15',
        FLIGHT_WINDOW_END: '2026-09-15',
      },
      cron: 'manual',
    });

    assert.equal(summary.skipped, false);
    assert.equal(summary.status, 'partial');
    assert.equal(summary.jobCount, 4);
    assert.equal(summary.snapshotCount, 7);
    const smiles = snapshots.filter((row) => row.program === 'smiles');
    assert.equal(smiles.length, summary.snapshotCount);
    assert.ok(smiles.every((row) => row.origin === 'PET' && row.destination === 'CGH'));
    const smilesWeb = smiles.filter((row) => row.source === 'smiles_web_dry_run');
    const voegol = smiles.filter((row) => row.source === 'voegol_dry_run');
    assert.equal(smilesWeb.length, 5);
    assert.equal(voegol.length, 2);
    assert.ok(smilesWeb.every((row) => row.amount_brl == null));
    assert.ok(voegol.every((row) => row.miles == null && row.amount_brl != null && row.amount_brl > 0));
    assert.ok(smiles.every((row) => row.ingest_run_id === summary.runId));
    assert.ok(smiles.every((row) => row.collected_at === summary.collectedAt));
    assert.ok(
      smilesWeb.some(
        (row) =>
          row.miles === 7200 &&
          row.amount_brl == null &&
          (row.raw_payload as { copay_brl?: number }).copay_brl === 248.5,
      ),
    );
    assert.ok(voegol.some((row) => row.amount_brl === 548.9));
    assert.ok(
      summary.failures.every(
        (f) => (f.program === 'tudoazul' || f.program === 'latam_pass') && f.status === 'auth_failed',
      ),
    );
    assert.equal(summary.failures.length, 3);
    assert.equal(runs[0]!.status, 'partial');
  });

  it('persists Smiles + TudoAzul + LATAM Pass dry-run snapshots for a one-day window', async () => {
    const { store, snapshots, runs } = memoryStore();
    const summary = await runIngest({
      ...baseDeps(store),
      env: {
        SMILES_DRY_RUN: '1',
        TUDOAZUL_DRY_RUN: '1',
        LATAM_DRY_RUN: '1',
        FLIGHT_WINDOW_START: '2026-09-15',
        FLIGHT_WINDOW_END: '2026-09-15',
      },
      cron: 'manual',
    });

    assert.equal(summary.skipped, false);
    assert.equal(summary.status, 'success');
    assert.equal(summary.jobCount, 4);
    const smiles = snapshots.filter((row) => row.program === 'smiles');
    const azul = snapshots.filter((row) => row.program === 'tudoazul');
    const latam = snapshots.filter((row) => row.program === 'latam_pass');
    assert.equal(smiles.length, 7);
    assert.ok(azul.length > 0);
    assert.ok(latam.length > 0);
    assert.equal(summary.snapshotCount, smiles.length + azul.length + latam.length);
    assert.ok(smiles.some((row) => row.source === 'smiles_web_dry_run' && row.miles != null && row.amount_brl == null));
    assert.ok(smiles.some((row) => row.source === 'voegol_dry_run' && row.amount_brl != null && row.miles == null));
    assert.ok(smiles.filter((row) => row.source === 'smiles_web_dry_run').every((row) => row.amount_brl == null));
    assert.ok(smiles.every((row) => row.source.endsWith('_dry_run')));
    assert.ok(azul.every((row) => row.origin === 'PET' && (row.destination === 'VCP' || row.destination === 'POA')));
    assert.ok(azul.some((row) => row.source === 'tudoazul_dry_run' && row.miles != null && row.amount_brl == null));
    assert.ok(azul.some((row) => row.source === 'voeazul_dry_run' && row.amount_brl != null && row.miles == null));
    assert.ok(
      azul
        .filter((row) => row.destination === 'VCP')
        .every((row) => ((row.raw_payload as { stops?: number | null }).stops ?? 0) > 0),
      'PET→VCP before 2026-10-26 must not invent nonstop',
    );
    assert.ok(azul.every((row) => row.ingest_run_id === summary.runId));
    assert.ok(azul.every((row) => row.miles !== 0 && row.amount_brl !== 0));
    assert.ok(latam.every((row) => row.origin === 'PET' && row.destination === 'GRU'));
    assert.ok(latam.some((row) => row.source === 'latam_pass_dry_run' && row.miles != null && row.amount_brl == null));
    assert.ok(latam.some((row) => row.source === 'latam_web_dry_run' && row.amount_brl != null && row.miles == null));
    assert.ok(latam.every((row) => row.ingest_run_id === summary.runId));
    assert.ok(latam.every((row) => row.miles !== 0 && row.amount_brl !== 0));
    assert.equal(runs[0]!.status, 'success');
  });
});

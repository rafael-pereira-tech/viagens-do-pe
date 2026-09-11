import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CollectParams, CollectResult, Snapshot } from '../src/collectors/types.ts';
import { runIngest } from '../src/scheduler.ts';
import type { IngestRunInsert, SnapshotStore } from '../src/supabase.ts';

function memoryStore() {
  const snapshots: Snapshot[] = [];
  const runs: IngestRunInsert[] = [];
  const store: SnapshotStore = {
    async insertSnapshots(rows) {
      snapshots.push(...rows);
      return rows.length;
    },
    async insertRun(run) {
      runs.push(run);
    },
  };
  return { store, snapshots, runs };
}

describe('runIngest', () => {
  it('runs the full stub matrix and records an empty ingest_run', async () => {
    const { store, snapshots, runs } = memoryStore();
    const summary = await runIngest({
      env: {},
      cron: '0 12 * * *',
      scheduledTime: new Date('2026-09-11T12:00:00Z'),
      store,
    });

    assert.equal(summary.status, 'empty');
    assert.equal(summary.jobCount, 122 * 4);
    assert.equal(summary.snapshotCount, 0);
    assert.equal(summary.persisted, true);
    assert.equal(summary.routes.length, 4);
    assert.equal(snapshots.length, 0);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.status, 'empty');
    assert.equal(runs[0]!.cron, '0 12 * * *');
  });

  it('skips persistence when Supabase env is missing or a placeholder', async () => {
    const summary = await runIngest({
      env: {
        SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'your-service-role-key',
      },
      cron: 'manual',
      scheduledTime: new Date('2026-09-11T12:00:00Z'),
    });
    assert.equal(summary.status, 'empty');
    assert.equal(summary.persisted, false);
    assert.equal(summary.jobCount, 122 * 4);
  });

  it('persists collector snapshots and reports success', async () => {
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

    const summary = await runIngest({
      env: {},
      cron: 'manual',
      scheduledTime: new Date('2026-09-11T12:00:00Z'),
      collect,
      store,
    });

    assert.equal(summary.status, 'success');
    assert.equal(summary.snapshotCount, 1);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]!.miles, 12000);
    assert.equal(runs[0]!.status, 'success');
  });

  it('maps collector throws to scrape_failed and overall partial when mixed with empty', async () => {
    const { store } = memoryStore();
    const collect = async (params: CollectParams): Promise<CollectResult> => {
      if (params.destination === 'GRU' && params.flightDate === '2026-09-01') {
        throw new Error('boom');
      }
      return { status: 'empty', snapshots: [] };
    };

    const summary = await runIngest({
      env: {},
      cron: 'manual',
      scheduledTime: new Date('2026-09-11T12:00:00Z'),
      collect,
      store,
    });

    assert.equal(summary.status, 'partial');
    assert.equal(summary.failures.length, 1);
    assert.equal(summary.failures[0]!.status, 'scrape_failed');
    assert.equal(summary.failures[0]!.error, 'boom');
  });
});

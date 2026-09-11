import type { CollectResult, Collector } from './types';

/**
 * Placeholder until BE-3/4/5 land. Returns no snapshots so the cron,
 * job matrix, and persist path can ship without airline scraping.
 */
export function createStubCollector(_source: string): Collector {
  return {
    async collect(): Promise<CollectResult> {
      return { status: 'empty', snapshots: [] };
    },
  };
}

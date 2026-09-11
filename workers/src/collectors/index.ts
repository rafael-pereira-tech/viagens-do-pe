import type { Program } from '../config';
import type { Env } from '../env';
import { latamPassCollector } from './latam-pass';
import { createSmilesCollector } from './smiles';
import { createTudoAzulCollector } from './tudoazul';
import type { Collector } from './types';

export type { CollectParams, CollectResult, Collector, Snapshot } from './types';

export function createCollectors(env: Env = {}): Record<Program, Collector> {
  return {
    smiles: createSmilesCollector(env),
    tudoazul: createTudoAzulCollector(env),
    latam_pass: latamPassCollector,
  };
}

export function getCollector(program: Program, env: Env = {}): Collector {
  const collector = createCollectors(env)[program];
  if (!collector) {
    throw new Error(`No collector registered for program ${program}`);
  }
  return collector;
}

/** Default registry without airline credentials (Smiles/TudoAzul auth_failed until env is passed). */
export const collectors: Record<Program, Collector> = createCollectors();

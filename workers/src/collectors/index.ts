import type { Program } from '../config';
import { latamPassCollector } from './latam-pass';
import { smilesCollector } from './smiles';
import { tudoAzulCollector } from './tudoazul';
import type { Collector } from './types';

export type { CollectParams, CollectResult, Collector, Snapshot } from './types';

export const collectors: Record<Program, Collector> = {
  smiles: smilesCollector,
  tudoazul: tudoAzulCollector,
  latam_pass: latamPassCollector,
};

export function getCollector(program: Program): Collector {
  const collector = collectors[program];
  if (!collector) {
    throw new Error(`No collector registered for program ${program}`);
  }
  return collector;
}

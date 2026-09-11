/**
 * BE-3: Smiles / GOL collector (PET→CGH).
 *
 * Miles rows: `source=smiles_web`, `program=smiles`. Smiles `money` is copay only
 * (`raw_payload.copay_brl`), never `amount_brl`.
 * Full cash BRL: companion `source=voegol` (same collect() / program smiles).
 */
export { createSmilesCollector, smilesCollector } from './collector';
export { SMILES_SOURCE, VOEGOL_SOURCE } from './constants';

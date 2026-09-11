/**
 * BE-5: LATAM Pass / LATAM collector (PET→GRU, miles + BRL).
 *
 * Sources: `latam_pass` (award / miles+money) and `latam_web` (full cash).
 * `program` stays `latam_pass`. Partner/NDC award search is not public — skipped.
 */
export { createLatamPassCollector, latamPassCollector } from './collector';

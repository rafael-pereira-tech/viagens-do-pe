import { createCollectors } from '../collectors';
import type { Airline, Program } from '../config';
import type { Env } from '../env';
import { json, jsonError } from './http';

const AIRLINES = new Set<Airline>(['GOL', 'AZUL', 'LATAM']);
const PROGRAMS = new Set<Program>(['smiles', 'tudoazul', 'latam_pass']);

export async function handleStagingProbe(request: Request, env: Env): Promise<Response> {
  if (env.ENVIRONMENT !== 'staging') return jsonError('not_found', 404);
  if (request.method !== 'POST') return jsonError('method_not_allowed', 405);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }
  if (!body || typeof body !== 'object') return jsonError('invalid_probe', 400);
  const input = body as Record<string, unknown>;
  const origin = typeof input.origin === 'string' ? input.origin.toUpperCase() : '';
  const destination = typeof input.destination === 'string' ? input.destination.toUpperCase() : '';
  const flightDate = typeof input.flightDate === 'string' ? input.flightDate : '';
  const airline = typeof input.airline === 'string' ? input.airline.toUpperCase() : '';
  const program = typeof input.program === 'string' ? input.program.toLowerCase() : '';
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || !/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
    return jsonError('invalid_probe', 400, 'origin/destination IATA and flightDate YYYY-MM-DD are required');
  }
  if (!AIRLINES.has(airline as Airline) || !PROGRAMS.has(program as Program)) return jsonError('invalid_probe', 400);

  const started = Date.now();
  try {
    const result = await createCollectors(env)[program as Program].collect({
      origin,
      destination,
      flightDate,
      airline: airline as Airline,
      program: program as Program,
    });
    const counts = result.snapshots.reduce<Record<string, number>>((acc, row) => {
      acc[row.source] = (acc[row.source] ?? 0) + 1;
      return acc;
    }, {});
    return json({
      ok: result.status === 'success' || result.status === 'empty' || result.status === 'partial',
      status: result.status,
      duration_ms: Date.now() - started,
      snapshot_count: result.snapshots.length,
      sources: counts,
      error_kind: result.error ? result.status : undefined,
    });
  } catch (error) {
    return jsonError('probe_failed', 502, error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200));
  }
}

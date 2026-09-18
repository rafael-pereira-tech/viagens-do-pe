/**
 * Evaluate price_alerts against newly written observations.
 * Channel `log` only for now — records price_alert_events + console.log.
 */
import type { PriceObservation } from './observations';
import { observationSourceBase } from './observations';
import type { SupabaseRest } from './supabase';

export type AlertMetric = 'miles' | 'amount_brl' | 'milheiro';
export type AlertCondition = 'below_abs' | 'drop_pct_vs_prev' | 'drop_pct_vs_7d_min';

export interface PriceAlert {
  id: string;
  enabled: boolean;
  origin: string | null;
  destination: string | null;
  source: string | null;
  flight_date: string | null;
  flight_date_from: string | null;
  flight_date_to: string | null;
  metric: AlertMetric;
  condition: AlertCondition;
  threshold: number;
  channel: string;
  last_fired_at: string | null;
  cooldown_minutes: number;
}

export interface AlertFire {
  alert: PriceAlert;
  observation: PriceObservation & { id?: string };
  payload: Record<string, unknown>;
}

function metricValue(obs: PriceObservation, metric: AlertMetric): number | null {
  if (metric === 'miles') return obs.miles ?? null;
  if (metric === 'amount_brl') return obs.amount_brl ?? null;
  return obs.milheiro ?? null;
}

function matchesScope(alert: PriceAlert, obs: PriceObservation): boolean {
  if (alert.origin && alert.origin !== obs.origin) return false;
  if (alert.destination && alert.destination !== obs.destination) return false;
  if (alert.source) {
    const want = observationSourceBase(alert.source);
    if (observationSourceBase(obs.source) !== want && obs.source !== alert.source) return false;
  }
  if (alert.flight_date && alert.flight_date !== obs.flight_date) return false;
  if (alert.flight_date_from && obs.flight_date < alert.flight_date_from) return false;
  if (alert.flight_date_to && obs.flight_date > alert.flight_date_to) return false;
  return true;
}

function inCooldown(alert: PriceAlert, now: Date): boolean {
  if (!alert.last_fired_at || alert.cooldown_minutes <= 0) return false;
  const last = Date.parse(alert.last_fired_at);
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last < alert.cooldown_minutes * 60_000;
}

export function shouldFire(
  alert: PriceAlert,
  current: number,
  prev: number | null,
  min7d: number | null,
): { fire: boolean; payload: Record<string, unknown> } {
  if (alert.condition === 'below_abs') {
    const fire = current <= alert.threshold;
    return { fire, payload: { current, threshold: alert.threshold } };
  }
  if (alert.condition === 'drop_pct_vs_prev') {
    if (prev == null || prev <= 0) return { fire: false, payload: { current, prev } };
    const dropPct = ((prev - current) / prev) * 100;
    return {
      fire: dropPct >= alert.threshold,
      payload: { current, prev, drop_pct: dropPct, threshold: alert.threshold },
    };
  }
  // drop_pct_vs_7d_min
  if (min7d == null || min7d <= 0) return { fire: false, payload: { current, min_7d: min7d } };
  const dropPct = ((min7d - current) / min7d) * 100;
  return {
    fire: dropPct >= alert.threshold,
    payload: { current, min_7d: min7d, drop_pct: dropPct, threshold: alert.threshold },
  };
}

interface HistRow {
  collected_at: string;
  miles: number | null;
  amount_brl: number | null;
  milheiro: number | null;
}

function histMetric(row: HistRow, metric: AlertMetric): number | null {
  if (metric === 'miles') return row.miles;
  if (metric === 'amount_brl') return row.amount_brl;
  return row.milheiro;
}

export async function loadEnabledAlerts(rest: SupabaseRest): Promise<PriceAlert[]> {
  const response = await rest(
    'price_alerts?enabled=eq.true&select=id,enabled,origin,destination,source,flight_date,flight_date_from,flight_date_to,metric,condition,threshold,channel,last_fired_at,cooldown_minutes',
    { method: 'GET' },
  );
  const rows = (await response.json()) as PriceAlert[];
  return Array.isArray(rows) ? rows : [];
}

async function loadSeriesHistory(
  rest: SupabaseRest,
  obs: PriceObservation,
  beforeIso: string,
): Promise<HistRow[]> {
  const params = new URLSearchParams({
    select: 'collected_at,miles,amount_brl,milheiro',
    origin: `eq.${obs.origin}`,
    destination: `eq.${obs.destination}`,
    source: `eq.${obs.source}`,
    flight_date: `eq.${obs.flight_date}`,
    collected_at: `lt.${beforeIso}`,
    order: 'collected_at.desc',
    limit: '50',
  });
  const response = await rest(`price_observations?${params.toString()}`, { method: 'GET' });
  const rows = (await response.json()) as HistRow[];
  return Array.isArray(rows) ? rows : [];
}

/**
 * Evaluate alerts for observations just written in this run.
 * `observationIds` maps series key → inserted observation id when available.
 */
export async function evaluateAlerts(
  rest: SupabaseRest,
  observations: PriceObservation[],
  observationIds: Map<string, string>,
  now = new Date(),
): Promise<AlertFire[]> {
  if (observations.length === 0) return [];
  const alerts = await loadEnabledAlerts(rest);
  if (alerts.length === 0) return [];

  const fires: AlertFire[] = [];
  const nowIso = now.toISOString();

  for (const obs of observations) {
    const scoped = alerts.filter((a) => matchesScope(a, obs) && !inCooldown(a, now));
    if (scoped.length === 0) continue;

    const history = await loadSeriesHistory(rest, obs, obs.collected_at);
    const sevenDaysAgo = new Date(Date.parse(obs.collected_at) - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const alert of scoped) {
      const current = metricValue(obs, alert.metric);
      if (current == null) continue;

      const prevRow = history[0];
      const prev = prevRow ? histMetric(prevRow, alert.metric) : null;
      let min7d: number | null = null;
      for (const row of history) {
        if (row.collected_at < sevenDaysAgo) continue;
        const v = histMetric(row, alert.metric);
        if (v == null) continue;
        if (min7d == null || v < min7d) min7d = v;
      }

      const { fire, payload } = shouldFire(alert, current, prev, min7d);
      if (!fire) continue;

      const seriesKey = `${obs.origin}|${obs.destination}|${obs.source}|${obs.flight_date}`;
      const observationId = observationIds.get(seriesKey);
      fires.push({
        alert,
        observation: { ...obs, id: observationId },
        payload: {
          ...payload,
          metric: alert.metric,
          condition: alert.condition,
          origin: obs.origin,
          destination: obs.destination,
          source: obs.source,
          flight_date: obs.flight_date,
        },
      });
    }
  }

  for (const fire of fires) {
    const obsId = fire.observation.id ?? null;
    await rest('price_alert_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        alert_id: fire.alert.id,
        observation_id: obsId,
        fired_at: nowIso,
        payload: fire.payload,
      }),
    });
    await rest(`price_alerts?id=eq.${encodeURIComponent(fire.alert.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_fired_at: nowIso, updated_at: nowIso }),
    });
    console.log(
      JSON.stringify({
        msg: 'price_alert_fired',
        channel: fire.alert.channel,
        alert_id: fire.alert.id,
        payload: fire.payload,
      }),
    );
  }

  return fires;
}

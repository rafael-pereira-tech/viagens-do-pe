import { API_URL } from './config.ts'

export type TrackEvent = 'page_view' | 'filter_apply' | 'tab_change' | 'chart_click'

export type TrackProps = Record<string, string | number | boolean | null | undefined>

const EVENTS_PATH = '/api/v1/events'

function currentPath(): string {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}`
}

/**
 * Fire-and-forget product event. Never throws; never blocks UI.
 * Public Worker ingest — no READ_API_KEY / Entrar.
 */
export function track(event: TrackEvent, props?: TrackProps): void {
  const base = API_URL.replace(/\/$/, '')
  if (!base) return

  const cleanProps: Record<string, string | number | boolean | null> = {}
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined) continue
      cleanProps[key] = value
    }
  }

  const body = JSON.stringify({
    event,
    props: cleanProps,
    path: currentPath(),
  })

  try {
    void fetch(`${base}${EVENTS_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* analytics must not surface */
    })
  } catch {
    /* ignore */
  }
}

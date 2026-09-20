export const DEFAULT_WORKER_API_URL = 'https://viagens-do-pe-ingest.rafaellimapereira.workers.dev'

export type ProxyEnv = {
  /** Pages Function secret. Same value as Worker READ_API_KEY. Never VITE_*. */
  API_READ_SECRET?: string
  /** Worker origin. Public URL, not a secret. */
  WORKER_API_URL?: string
}

export function apiV1Path(paramsPath: string | string[] | undefined): string | null {
  const segments = Array.isArray(paramsPath) ? paramsPath : paramsPath ? [paramsPath] : []
  if (segments[0] !== 'v1') return null
  return `/api/${segments.join('/')}`
}

export function hasIncludeRaw(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return [...params.keys()].some((key) => key.toLowerCase() === 'include_raw')
}

export function upstreamUrl(env: ProxyEnv, pathname: string, search: string): string {
  const base = (env.WORKER_API_URL || DEFAULT_WORKER_API_URL).replace(/\/$/, '')
  return `${base}${pathname}${search}`
}

/** Forward only safe request headers. Always overwrite Authorization from the Pages secret. */
export function proxyHeaders(request: Request, secret: string): Headers {
  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)
  const accept = request.headers.get('accept')
  if (accept) headers.set('Accept', accept)
  headers.set('Authorization', `Bearer ${secret}`)
  return headers
}

function jsonError(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function outgoingHeaders(upstream: Headers): Headers {
  const headers = new Headers(upstream)
  headers.delete('set-cookie')
  headers.delete('authorization')
  return headers
}

export async function proxyApiV1(
  request: Request,
  env: ProxyEnv,
  paramsPath: string | string[] | undefined,
): Promise<Response> {
  const pathname = apiV1Path(paramsPath)
  if (!pathname) {
    return jsonError(404, 'not_found', 'Only /api/v1/* is proxied.')
  }

  const secret = env.API_READ_SECRET?.trim()
  if (!secret) {
    return jsonError(
      503,
      'api_read_secret_not_configured',
      'Set Pages secret API_READ_SECRET (server env, not VITE_*).',
    )
  }

  const search = new URL(request.url).search
  if (hasIncludeRaw(search)) {
    return jsonError(400, 'include_raw_forbidden', 'include_raw is not available through the Pages proxy.')
  }

  const target = upstreamUrl(env, pathname, search)
  const init: RequestInit = {
    method: request.method,
    headers: proxyHeaders(request, secret),
    redirect: 'manual',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
  }

  const response = await fetch(target, init)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outgoingHeaders(response.headers),
  })
}

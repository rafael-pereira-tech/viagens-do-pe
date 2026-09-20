import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiV1Path, proxyApiV1, proxyHeaders, upstreamUrl } from './proxy.ts'

describe('apiV1Path', () => {
  it('joins catch-all segments under /api/v1', () => {
    expect(apiV1Path(['v1', 'snapshots', 'latest'])).toBe('/api/v1/snapshots/latest')
    expect(apiV1Path(['v1', 'health'])).toBe('/api/v1/health')
    expect(apiV1Path('v1')).toBe('/api/v1')
  })

  it('rejects anything outside /api/v1', () => {
    expect(apiV1Path(['v2', 'snapshots'])).toBeNull()
    expect(apiV1Path(['health'])).toBeNull()
    expect(apiV1Path(undefined)).toBeNull()
  })
})

describe('upstreamUrl', () => {
  it('defaults to the ingest Worker and keeps the query string', () => {
    expect(upstreamUrl({}, '/api/v1/snapshots', '?origin=PET')).toBe(
      'https://viagens-do-pe-ingest.rafaellimapereira.workers.dev/api/v1/snapshots?origin=PET',
    )
  })

  it('uses WORKER_API_URL when set', () => {
    expect(upstreamUrl({ WORKER_API_URL: 'https://worker.example/' }, '/api/v1/health', '')).toBe(
      'https://worker.example/api/v1/health',
    )
  })
})

describe('proxyHeaders', () => {
  it('injects the Pages secret and ignores a client Authorization header', () => {
    const request = new Request('https://pages.example/api/v1/snapshots', {
      headers: {
        Authorization: 'Bearer from-browser',
        Cookie: 'session=1',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
    const headers = proxyHeaders(request, 'pages-secret')
    expect(headers.get('Authorization')).toBe('Bearer pages-secret')
    expect(headers.get('Cookie')).toBeNull()
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Content-Type')).toBe('application/json')
  })
})

describe('proxyApiV1', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 404 outside /api/v1', async () => {
    const response = await proxyApiV1(new Request('https://pages.example/api/other'), {}, ['other'])
    expect(response.status).toBe(404)
  })

  it('returns 503 when the Pages secret is missing', async () => {
    const response = await proxyApiV1(new Request('https://pages.example/api/v1/health'), {}, ['v1', 'health'])
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: 'api_read_secret_not_configured' })
  })

  it('forwards method, path, query, and the server Bearer', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toBe('https://worker.example/api/v1/snapshots/latest?origin=PET')
      return new Response('{"data":[]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer leaked' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await proxyApiV1(
      new Request('https://pages.example/api/v1/snapshots/latest?origin=PET', {
        headers: { Authorization: 'Bearer from-browser' },
      }),
      { API_READ_SECRET: 'pages-secret', WORKER_API_URL: 'https://worker.example' },
      ['v1', 'snapshots', 'latest'],
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Authorization')).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer pages-secret')
    expect(init.method).toBe('GET')
  })
})

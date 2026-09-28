import { proxyApiV1, type ProxyEnv } from '../proxy.ts'

type PagesContext = {
  request: Request
  env: ProxyEnv
  params: { path?: string | string[] }
}

/** Same-origin `/api/*` → Worker `/api/v1/*` with server-side Authorization. */
export function onRequest(context: PagesContext): Promise<Response> {
  return proxyApiV1(context.request, context.env, context.params.path)
}

import * as Sentry from '@sentry/cloudflare';
import { applyCors, corsPreflight } from './api/cors';
import { handleReadApi } from './api/handlers';
import { handleStagingProbe } from './api/probe';
import type { Env } from './env';
import { runIngest } from './scheduler';
import { reportIngestToSentry, sentryOptions } from './sentry';

function authorizeManualRun(request: Request, env: Env): Response | null {
  const secret = env.INGEST_TRIGGER_SECRET;
  if (!secret) {
    return Response.json({ error: 'INGEST_TRIGGER_SECRET is not set' }, { status: 403 });
  }
  const header = request.headers.get('authorization') ?? '';
  if (header !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

const handler = {
  async scheduled(controller, env) {
    // Await the run so Cron Trigger status reflects ingest completion.
    // Overlap skips return normally (do not throw) so Cloudflare does not retry.
    const summary = await runIngest({
      env,
      cron: controller.cron,
      scheduledTime: new Date(controller.scheduledTime),
    });
    reportIngestToSentry(summary);
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (isApiPath(url.pathname) && request.method === 'OPTIONS') {
      return corsPreflight(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, service: 'viagens-do-pe-ingest' });
    }

    if (request.method === 'POST' && url.pathname === '/internal/probe') {
      const denied = authorizeManualRun(request, env);
      if (denied) return denied;
      return handleStagingProbe(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/internal/sentry-test') {
      const denied = authorizeManualRun(request, env);
      if (denied) return denied;
      if (!env.SENTRY_DSN?.trim()) {
        return Response.json({ error: 'SENTRY_DSN is not set' }, { status: 503 });
      }
      throw new Error('sentry_probe');
    }

    if (request.method === 'POST' && url.pathname === '/run') {
      const denied = authorizeManualRun(request, env);
      if (denied) return denied;
      const summary = await runIngest({
        env,
        cron: 'manual',
        scheduledTime: new Date(),
      });
      reportIngestToSentry(summary);
      return Response.json(summary, { status: summary.skipped ? 409 : 200 });
    }

    if (isApiPath(url.pathname)) {
      const response = await handleReadApi(request, env);
      return applyCors(request, env, response);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export default Sentry.withSentry((env: Env) => sentryOptions(env), handler);

import type { Env } from './env';
import { runIngest } from './scheduler';

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

export default {
  async scheduled(controller, env) {
    // Await the run so Cron Trigger status reflects ingest completion.
    await runIngest({
      env,
      cron: controller.cron,
      scheduledTime: new Date(controller.scheduledTime),
    });
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, service: 'viagens-do-pe-ingest' });
    }

    if (request.method === 'POST' && url.pathname === '/run') {
      const denied = authorizeManualRun(request, env);
      if (denied) return denied;
      const summary = await runIngest({
        env,
        cron: 'manual',
        scheduledTime: new Date(),
      });
      return Response.json(summary);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

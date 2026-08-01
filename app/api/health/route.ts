import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/env';

/**
 * Health check for uptime monitors and deploy verification.
 *
 * Reports dependency status without leaking configuration. Deliberately does not
 * echo URLs, key prefixes, or error details — a health endpoint is unauthenticated
 * and is a favourite reconnaissance target.
 *
 * Semantics:
 *  - 200 `ok`       — everything required is working
 *  - 200 `degraded` — optional dependency down (a provider, rate limiter)
 *  - 503 `down`     — the database is unreachable; the app cannot serve
 */

export const dynamic = 'force-dynamic';

interface Check {
  status: 'ok' | 'down' | 'unconfigured';
  latencyMs?: number;
}

export async function GET() {
  const started = Date.now();

  const [database] = await Promise.all([checkDatabase()]);

  // Config presence only — never call a paid provider from a health check, or a
  // monitor polling every 30s becomes a billing line item.
  const providers = {
    groq: serverEnv.groqApiKey ? 'ok' : 'unconfigured',
    nvidiaNim: serverEnv.nvidiaApiKey ? 'ok' : 'unconfigured',
  } as const;

  const rateLimiter: Check['status'] =
    serverEnv.upstashUrl && serverEnv.upstashToken ? 'ok' : 'unconfigured';

  const cron: Check['status'] = serverEnv.cronSecret ? 'ok' : 'unconfigured';

  // A verdict needs at least one provider; neither configured is degraded, not
  // down, because reading and voting still work.
  const hasProvider =
    providers.groq === 'ok' || providers.nvidiaNim === 'ok';

  const status =
    database.status !== 'ok'
      ? 'down'
      : !hasProvider || rateLimiter !== 'ok' || cron !== 'ok'
        ? 'degraded'
        : 'ok';

  return NextResponse.json(
    {
      status,
      uptimeCheckMs: Date.now() - started,
      checks: { database, providers, rateLimiter, cron },
      timestamp: new Date().toISOString(),
    },
    {
      status: status === 'down' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
}

/** Cheapest possible round-trip that proves the connection and RLS bypass work. */
async function checkDatabase(): Promise<Check> {
  const started = Date.now();
  try {
    const admin = createServiceClient();
    const { error } = await admin
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (error) {
      console.error('[health] database check failed:', error.message);
      return { status: 'down', latencyMs: Date.now() - started };
    }
    return { status: 'ok', latencyMs: Date.now() - started };
  } catch (error) {
    console.error('[health] database unreachable:', error);
    return { status: 'down', latencyMs: Date.now() - started };
  }
}

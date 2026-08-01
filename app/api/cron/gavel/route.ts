import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { safeEqual } from '@/lib/auth/fingerprint';
import { findDueCases, closeCase } from '@/lib/court/gavel';

/**
 * The gavel sweep — closes cases whose jury phase has ended and generates their
 * verdicts.
 *
 * Triggered by an **external scheduler** (cron-job.org), not Vercel Cron: the
 * Hobby plan only fires cron jobs once per day, and this needs every 5 minutes.
 * Setup is in docs/CRON.md.
 *
 * Because the trigger is external, this route is written to be safe for *any*
 * scheduler: it authenticates three ways, tolerates GET or POST, and bounds its
 * own runtime so it answers well inside a typical 30s HTTP client timeout.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Wall-clock budget for generating verdicts.
 *
 * Deliberately well under both `maxDuration` (60s) and a typical external
 * scheduler timeout (30s). Each verdict can take up to 12s per provider, so a
 * full batch of ten could otherwise run past two minutes — the scheduler would
 * record a timeout failure while the work carried on invisibly.
 *
 * Whatever does not fit is left for the next tick, which is safe because closing
 * a case is idempotent and `getCase()` also closes overdue cases lazily on read.
 */
const BUDGET_MS = 20_000;

/** Upper bound on cases fetched per invocation. The budget usually binds first. */
const MAX_BATCH = 10;

/**
 * Authorises the request. **Fails closed when `CRON_SECRET` is unset** — an
 * unauthenticated endpoint that triggers LLM spend is not something to leave open
 * by default, and a missing env var in production is a misconfiguration, not
 * permission.
 *
 * Three accepted forms, all compared in constant time:
 *  1. `Authorization: Bearer <secret>` — preferred.
 *  2. `x-cron-secret: <secret>` — for schedulers that reserve `Authorization`.
 *  3. `?key=<secret>` — last resort for schedulers that cannot send headers.
 *
 * Form 3 is a real tradeoff: query strings land in access logs, proxy logs, and
 * the scheduler's own execution history. It exists so setup is never blocked, but
 * docs/CRON.md tells you to use a header. Note that no form short-circuits to
 * `false`, so a malformed header does not mask a valid fallback.
 */
function isAuthorised(request: NextRequest): boolean {
  const secret = serverEnv.cronSecret;
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set — refusing to run.');
    return false;
  }

  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ') && safeEqual(bearer.slice(7).trim(), secret)) {
    return true;
  }

  const headerSecret = request.headers.get('x-cron-secret')?.trim();
  if (headerSecret && safeEqual(headerSecret, secret)) {
    return true;
  }

  const urlKey = request.nextUrl.searchParams.get('key')?.trim();
  if (urlKey && safeEqual(urlKey, secret)) {
    return true;
  }

  return false;
}

async function sweep(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const due = await findDueCases(MAX_BATCH);

  if (due.length === 0) {
    return NextResponse.json({ swept: 0, remaining: 0, results: [] });
  }

  /*
   * Sequential, not parallel: the provider rate limit is global, so ten
   * concurrent completions would simply trip it. The budget check runs before
   * each case rather than after, so a long case cannot push the response past
   * the scheduler's timeout.
   */
  const results = [];
  for (const caseRow of due) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    results.push(await closeCase(caseRow));
  }

  return NextResponse.json({
    swept: results.length,
    // Non-zero means the next tick has work waiting — useful when tuning the
    // schedule against real volume.
    remaining: due.length - results.length,
    tookMs: Date.now() - startedAt,
    results,
  });
}

export async function GET(request: NextRequest) {
  return sweep(request);
}

/**
 * Some schedulers only offer POST, or default to it. The sweep is idempotent, so
 * accepting both costs nothing and removes a setup footgun.
 */
export async function POST(request: NextRequest) {
  return sweep(request);
}

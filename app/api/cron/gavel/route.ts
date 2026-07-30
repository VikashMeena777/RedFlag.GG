import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { safeEqual } from '@/lib/auth/fingerprint';
import { findDueCases, closeCase } from '@/lib/court/gavel';

/**
 * The gavel sweep. Scheduled every 5 minutes (see vercel.json).
 *
 * Closes cases whose jury phase has ended and generates their verdicts. Handles
 * a small batch per invocation so one slow provider cannot blow the function
 * timeout; the next tick picks up the remainder.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Authorises the request.
 *
 * **Fails closed when CRON_SECRET is unset.** An unauthenticated endpoint that
 * triggers LLM spend is not something to leave open by default, and a missing
 * env var in production is a misconfiguration, not permission.
 */
function isAuthorised(request: NextRequest): boolean {
  const secret = serverEnv.cronSecret;
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set — refusing to run.');
    return false;
  }

  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    return safeEqual(bearer.slice(7), secret);
  }

  // Vercel Cron sends this header; support it as an alternative.
  const headerSecret = request.headers.get('x-cron-secret');
  return headerSecret ? safeEqual(headerSecret, secret) : false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const due = await findDueCases(10);
  if (due.length === 0) {
    return NextResponse.json({ swept: 0, results: [] });
  }

  // Sequential, not parallel: the provider rate limit is global, and a burst of
  // ten concurrent completions would just trip it.
  const results = [];
  for (const caseRow of due) {
    results.push(await closeCase(caseRow));
  }

  return NextResponse.json({ swept: results.length, results });
}

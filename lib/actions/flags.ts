'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { clientIp } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { flagSchema, sanitizeText } from '@/lib/validation';

/**
 * Community flagging.
 *
 * Verified-only, deliberately: an anonymous mob able to mass-flag is a takedown
 * weapon, since five distinct flags auto-hide a case. Requiring a real account
 * makes brigading traceable and rate-limitable.
 *
 * A duplicate flag is reported as success. Telling someone "you already flagged
 * this" leaks that their earlier flag registered, and there is nothing useful for
 * them to do differently.
 */

export interface FlagResult {
  ok: boolean;
  error?: string;
  alreadyFlagged?: boolean;
}

export async function flagCase(
  slug: string,
  reason: string
): Promise<FlagResult> {
  const parsed = flagSchema.safeParse({ slug, reason });
  if (!parsed.success) {
    return { ok: false, error: 'Tell us why, in a sentence or two.' };
  }

  const viewer = await getViewer();
  if (!viewer.canFlag) {
    return {
      ok: false,
      error: 'Flagging requires a verified account.',
    };
  }

  const ip = clientIp(await headers());
  const limit = await checkLimit('flag', `${viewer.userId}:${ip}`);
  if (!limit.ok) return { ok: false, error: limitMessage(limit) };

  const supabase = await createClient();

  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, author_id')
    .eq('slug', parsed.data.slug)
    .maybeSingle();

  if (!caseRow) return { ok: false, error: 'Case not found.' };
  if (caseRow.author_id === viewer.userId) {
    return { ok: false, error: 'You cannot flag your own case.' };
  }

  const { error } = await supabase.from('flags').insert({
    case_id: caseRow.id,
    user_id: viewer.userId!,
    reason: sanitizeText(parsed.data.reason).slice(0, 300),
  });

  if (error) {
    // Unique violation: they already flagged it. Treat as done.
    if (error.code === '23505' || error.message.includes('duplicate key')) {
      return { ok: true, alreadyFlagged: true };
    }
    if (error.message.includes('VERIFICATION_REQUIRED')) {
      return { ok: false, error: 'Flagging requires a verified account.' };
    }
    console.error('[flags] insert failed:', error.message);
    return { ok: false, error: 'Could not submit the report. Try again.' };
  }

  revalidatePath(`/case/${parsed.data.slug}`);
  return { ok: true };
}

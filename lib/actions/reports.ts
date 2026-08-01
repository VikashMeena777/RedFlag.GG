'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { clientIp } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { reportSchema, sanitizeText } from '@/lib/validation';
import type { ReportReason } from '@/lib/moderation/report-reasons';

/**
 * Community reporting.
 *
 * Verified-only, deliberately: an anonymous mob able to mass-report is a takedown
 * weapon, since five distinct pending reports auto-hide a case (enforced by the
 * `reports_sync_count` trigger). Requiring a real account makes brigading
 * traceable and rate-limitable.
 *
 * A duplicate report is reported as success. Telling someone "you already
 * reported this" leaks that their earlier report registered, and there is nothing
 * useful for them to do differently.
 */

export interface ReportResult {
  ok: boolean;
  error?: string;
  alreadyReported?: boolean;
}

export async function reportCase(
  publicId: string,
  reason: ReportReason,
  details: string
): Promise<ReportResult> {
  const parsed = reportSchema.safeParse({ publicId, reason, details });
  if (!parsed.success) {
    return { ok: false, error: 'Pick a reason and add a short explanation.' };
  }

  const viewer = await getViewer();
  if (!viewer.canReport) {
    return { ok: false, error: 'Reporting requires a verified account.' };
  }

  const ip = clientIp(await headers());
  const limit = await checkLimit('flag', `${viewer.userId}:${ip}`);
  if (!limit.ok) return { ok: false, error: limitMessage(limit) };

  const supabase = await createClient();

  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, author_id')
    .eq('public_id', parsed.data.publicId)
    .maybeSingle();

  if (!caseRow) return { ok: false, error: 'Case not found.' };
  if (caseRow.author_id === viewer.userId) {
    return { ok: false, error: 'You cannot report your own case.' };
  }

  const { error } = await supabase.from('reports').insert({
    target_case_id: caseRow.id,
    reporter_id: viewer.userId!,
    reason: parsed.data.reason,
    details: sanitizeText(parsed.data.details).slice(0, 500) || null,
    status: 'pending',
  });

  if (error) {
    // `reports_case_reporter_uniq` violation: they already reported it.
    if (error.code === '23505' || error.message.includes('duplicate key')) {
      return { ok: true, alreadyReported: true };
    }
    console.error('[reports] insert failed:', error.message);
    return { ok: false, error: 'Could not submit the report. Try again.' };
  }

  revalidatePath(`/case/${parsed.data.publicId}`);
  return { ok: true };
}

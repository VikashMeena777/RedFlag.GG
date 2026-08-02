'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ShieldAlert, Check } from 'lucide-react';
import { reportCase } from '@/lib/actions/reports';
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  type ReportReason,
} from '@/lib/moderation/report-reasons';
import { NeonButton } from '@/components/ui/neon';
import { cn } from '@/lib/utils';

/**
 * Report control.
 *
 * Verified-only by design: five distinct pending reports auto-hide a case, so an
 * anonymous mob able to mass-report would be a takedown weapon. Requiring a real
 * account makes brigading traceable and rate-limitable.
 *
 * Reasons are structured rather than free text so the moderation queue can triage
 * without reading prose.
 */
export function ReportButton({
  caseId,
  canReport,
}: {
  caseId: string;
  canReport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('identifies_someone');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="hud flex items-center gap-1.5 text-verdict-green">
        <Check className="size-3.5" strokeWidth={2} aria-hidden />
        Report received — the clerk will review it
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!canReport) {
            toast.error('Reporting requires a verified account.');
            return;
          }
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint transition-colors hover:text-verdict-red"
      >
        <ShieldAlert className="size-3.5" strokeWidth={2} aria-hidden />
        Report this case
      </button>
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await reportCase(caseId, reason, details);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not submit the report.');
        return;
      }
      setDone(true);
      setOpen(false);
      toast.success('Report received');
    });
  }

  return (
    <div className="panel w-full max-w-sm p-5">
      <fieldset>
        <legend className="hud mb-3">Why should the clerk look at this?</legend>
        <div className="flex flex-col gap-2">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              className={cn(
                'flex items-center gap-2.5 rounded-[3px] border px-3 py-2.5 text-left text-xs font-medium transition-colors',
                reason === r
                  ? 'border-verdict-red/60 bg-verdict-red-soft text-verdict-red'
                  : 'border-rule bg-surface text-ink-muted hover:border-rule-strong hover:text-ink'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full border',
                  reason === r
                    ? 'border-verdict-red bg-verdict-red'
                    : 'border-rule-strong'
                )}
              >
                {reason === r && (
                  <span className="size-1.5 rounded-full bg-surface" />
                )}
              </span>
              {REPORT_REASON_LABELS[r]}
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor="report-details" className="hud mt-5 block">
        Anything else? (optional)
      </label>
      <textarea
        id="report-details"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={2}
        maxLength={500}
        className="panel-sunk mt-2 w-full resize-none p-3 text-sm text-ink outline-none transition-colors focus:border-verdict-split"
      />

      <div className="mt-4 flex gap-2.5">
        <NeonButton size="sm" variant="red" onClick={submit} disabled={isPending}>
          {isPending ? 'Sending…' : 'Submit report'}
        </NeonButton>
        <NeonButton size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </NeonButton>
      </div>
    </div>
  );
}

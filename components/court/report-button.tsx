'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';
import { flagCase } from '@/lib/actions/flags';
import { BrutButton } from '@/components/ui/brut';

/**
 * Report control.
 *
 * Verified-only by design: five distinct flags auto-hide a case, so an anonymous
 * mob able to mass-flag would be a takedown weapon. Requiring a real account
 * makes brigading traceable and rate-limitable.
 */
export function ReportButton({
  slug,
  canFlag,
}: {
  slug: string;
  canFlag: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="font-docket text-[10px] font-bold tracking-[0.14em] text-ink-soft">
        REPORT RECEIVED — THE CLERK WILL REVIEW IT
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!canFlag) {
            toast.error('Reporting requires a verified account.');
            return;
          }
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 font-docket text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-flag-red"
      >
        <ShieldAlert className="size-3.5" strokeWidth={2.75} aria-hidden />
        Report this case
      </button>
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await flagCase(slug, reason);
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
    <div className="brut w-full max-w-sm bg-paper-dim p-4">
      <label
        htmlFor="report-reason"
        className="docket-label mb-2 block text-ink"
      >
        Why should the clerk look at this?
      </label>
      <textarea
        id="report-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={300}
        placeholder="Names a real person, harassment, underage, spam…"
        className="brut-thin w-full resize-none bg-paper-bright p-2.5 text-sm text-ink placeholder:text-ink-faint"
      />
      <div className="mt-3 flex gap-2">
        <BrutButton
          size="sm"
          variant="red"
          onClick={submit}
          disabled={isPending || reason.trim().length < 4}
        >
          {isPending ? 'Sending…' : 'Submit report'}
        </BrutButton>
        <BrutButton size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </BrutButton>
      </div>
    </div>
  );
}

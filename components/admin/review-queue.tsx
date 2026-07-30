'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EyeOff, Eye, Trash2, ShieldCheck, Flag } from 'lucide-react';
import {
  hideCase,
  restoreCase,
  removeCase,
  dismissReports,
  type FlaggedCase,
} from '@/lib/actions/admin';
import { BrutButton, BrutCard, DocketRule, Stamp } from '@/components/ui/brut';
import { formatCaseNo, excerpt } from '@/lib/utils';

/**
 * Review queue UI.
 *
 * Removal is the destructive action here — it strikes the author — so it asks for
 * confirmation and an optional note that lands in the audit log. Hiding is
 * reversible and does not.
 */
export function ReviewQueue({ cases }: { cases: FlaggedCase[] }) {
  if (cases.length === 0) {
    return (
      <BrutCard className="p-8 text-center">
        <ShieldCheck
          className="mx-auto size-10 text-flag-green"
          strokeWidth={2.75}
          aria-hidden
        />
        <h2 className="mt-4 text-2xl text-ink">Queue is clear</h2>
        <p className="mt-2 text-sm text-ink-soft">
          No reported or auto-hidden cases waiting.
        </p>
      </BrutCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {cases.map((item) => (
        <ReviewRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function ReviewRow({ item }: { item: FlaggedCase }) {
  const [isPending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [note, setNote] = useState('');

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? 'Action failed.');
        return;
      }
      toast.success(successMessage);
      setConfirmRemove(false);
    });
  }

  return (
    <BrutCard as="article" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-docket text-[11px] font-bold tracking-[0.14em] text-ink">
          {formatCaseNo(item.caseNo)}
        </span>
        {item.isHidden && (
          <Stamp straight tone="red" className="text-[10px]">
            HIDDEN
          </Stamp>
        )}
        {item.flagCount > 0 && (
          <span className="inline-flex items-center gap-1 bg-flag-red-lo px-2 py-0.5 font-docket text-[10px] font-bold tracking-[0.12em] text-flag-red">
            <Flag className="size-3" strokeWidth={2.75} aria-hidden />
            {item.flagCount} REPORT{item.flagCount === 1 ? '' : 'S'}
          </span>
        )}
        {item.needsReview && item.flagCount === 0 && (
          <Stamp straight tone="judge" className="text-[10px]">
            LANGUAGE
          </Stamp>
        )}
      </div>

      <h3 className="mt-3 text-lg leading-tight text-ink">{item.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {excerpt(item.body, 320)}
      </p>

      {item.reasons.length > 0 && (
        <>
          <DocketRule className="my-4" />
          <p className="docket-label mb-2">Reports</p>
          <ul className="space-y-1.5">
            {item.reasons.map((reason, i) => (
              <li
                key={i}
                className="border-l-[4px] border-flag-red pl-2.5 text-xs leading-relaxed text-ink"
              >
                {reason}
              </li>
            ))}
          </ul>
        </>
      )}

      <DocketRule className="my-4" />

      {confirmRemove ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-flag-red">
            Remove this case and strike the author? This is not reversible from
            here.
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for the audit log (optional)"
            className="brut-thin bg-paper-bright p-2 text-sm text-ink placeholder:text-ink-faint"
          />
          <div className="flex flex-wrap gap-2">
            <BrutButton
              size="sm"
              variant="red"
              disabled={isPending}
              onClick={() =>
                run(() => removeCase(item.id, note || undefined), 'Case removed')
              }
            >
              <Trash2 className="size-4" strokeWidth={2.75} aria-hidden />
              Confirm removal
            </BrutButton>
            <BrutButton
              size="sm"
              variant="ghost"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </BrutButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {item.isHidden ? (
            <BrutButton
              size="sm"
              variant="green"
              disabled={isPending}
              onClick={() => run(() => restoreCase(item.id), 'Case restored')}
            >
              <Eye className="size-4" strokeWidth={2.75} aria-hidden />
              Restore
            </BrutButton>
          ) : (
            <BrutButton
              size="sm"
              variant="ink"
              disabled={isPending}
              onClick={() => run(() => hideCase(item.id), 'Case hidden')}
            >
              <EyeOff className="size-4" strokeWidth={2.75} aria-hidden />
              Hide
            </BrutButton>
          )}

          <BrutButton
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              run(() => dismissReports(item.id), 'Reports dismissed')
            }
          >
            <ShieldCheck className="size-4" strokeWidth={2.75} aria-hidden />
            Dismiss reports
          </BrutButton>

          <BrutButton
            size="sm"
            variant="red"
            disabled={isPending}
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 className="size-4" strokeWidth={2.75} aria-hidden />
            Remove + strike
          </BrutButton>
        </div>
      )}
    </BrutCard>
  );
}

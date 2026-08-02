'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EyeOff, Eye, Trash2, ShieldCheck, Flag, Check } from 'lucide-react';
import {
  hideCase,
  approveCase,
  removeCase,
  dismissReports,
  type QueuedCase,
} from '@/lib/actions/admin';
import { NeonButton, Panel, Chip, Rule } from '@/components/ui/neon';
import { formatCaseNo, excerpt } from '@/lib/utils';
import {
  REPORT_REASON_LABELS,
  type ReportReason,
} from '@/lib/moderation/report-reasons';
import { MAX_STRIKES } from '@/lib/types';

/**
 * Review queue UI.
 *
 * Removal is the destructive action — it strikes the author — so it asks for
 * confirmation and an optional note that lands in the audit log. Hiding and
 * approving are reversible and do not.
 */
export function ReviewQueue({ cases }: { cases: QueuedCase[] }) {
  if (cases.length === 0) {
    return (
      <Panel className="p-10 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-[3px] bg-verdict-green-soft ring-1 ring-verdict-green/30">
          <ShieldCheck
            className="size-6 text-verdict-green"
            strokeWidth={2}
            aria-hidden
          />
        </span>
        <h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
          Queue is clear
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Nothing reported, hidden, or awaiting review.
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {cases.map((item) => (
        <ReviewRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function ReviewRow({ item }: { item: QueuedCase }) {
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

  /*
   * Tone the panel edge by severity, so a triage pass can be done by scanning:
   * hidden is already actioned (red), pending_review is waiting on a human (split).
   */
  const tone =
    item.status === 'hidden'
      ? 'red'
      : item.status === 'pending_review'
        ? 'split'
        : 'neutral';

  return (
    <Panel as="article" tone={tone} className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="hud">{formatCaseNo(item.publicId)}</span>

        {item.status === 'hidden' && <Chip tone="red">Hidden</Chip>}
        {item.status === 'pending_review' && (
          <Chip tone="split">Awaiting review</Chip>
        )}

        {item.reportCount > 0 && (
          <Chip tone="red">
            <Flag className="size-3" strokeWidth={2} aria-hidden />
            {item.reportCount} report{item.reportCount === 1 ? '' : 's'}
          </Chip>
        )}

        {/* Author standing informs how severe a removal would be. */}
        {item.authorHandle && (
          <Chip tone={item.authorStrikes > 0 ? 'heat' : 'neutral'}>
            {item.authorHandle} · {item.authorStrikes}/{MAX_STRIKES}
          </Chip>
        )}
      </div>

      <h3 className="mt-3.5 font-display text-lg font-semibold leading-snug tracking-[-0.03em] text-ink">
        {item.title}
      </h3>
      <p className="mt-2 font-read text-sm leading-relaxed text-ink-muted">
        {excerpt(item.body, 320)}
      </p>

      {item.reports.length > 0 && (
        <>
          <Rule className="my-5" />
          <p className="hud mb-2.5">Reports</p>
          <ul className="space-y-2">
            {item.reports.map((report, i) => (
              <li
                key={i}
                className="border-l-2 border-verdict-red/60 pl-3 text-xs leading-relaxed text-ink-muted"
              >
                <span className="hud text-verdict-red">
                  {REPORT_REASON_LABELS[report.reason as ReportReason] ??
                    report.reason}
                </span>
                {report.details && <span> — {report.details}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <Rule className="my-5" />

      {confirmRemove ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-verdict-red">
            Remove this case and strike the author? At {MAX_STRIKES} strikes they
            lose filing rights.
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for the audit log (optional)"
            className="panel-sunk p-2.5 text-sm text-ink outline-none transition-colors focus:border-verdict-split"
          />
          <div className="flex flex-wrap gap-2.5">
            <NeonButton
              size="sm"
              variant="red"
              disabled={isPending}
              onClick={() =>
                run(() => removeCase(item.id, note || undefined), 'Case removed')
              }
            >
              <Trash2 className="size-4" strokeWidth={2} aria-hidden />
              Confirm removal
            </NeonButton>
            <NeonButton
              size="sm"
              variant="ghost"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </NeonButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {item.status !== 'live' && (
            <NeonButton
              size="sm"
              variant="green"
              disabled={isPending}
              onClick={() => run(() => approveCase(item.id), 'Case published')}
            >
              <Check className="size-4" strokeWidth={2} aria-hidden />
              Publish
            </NeonButton>
          )}

          {item.status === 'live' && (
            <NeonButton
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => run(() => hideCase(item.id), 'Case hidden')}
            >
              <EyeOff className="size-4" strokeWidth={2} aria-hidden />
              Hide
            </NeonButton>
          )}

          {item.reportCount > 0 && (
            <NeonButton
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() =>
                run(() => dismissReports(item.id), 'Reports dismissed')
              }
            >
              <Eye className="size-4" strokeWidth={2} aria-hidden />
              Dismiss reports
            </NeonButton>
          )}

          <NeonButton
            size="sm"
            variant="red"
            disabled={isPending}
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 className="size-4" strokeWidth={2} aria-hidden />
            Remove + strike
          </NeonButton>
        </div>
      )}
    </Panel>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, AlertTriangle, XCircle } from 'lucide-react';
import { deleteMyAccount } from '@/lib/actions/account';
import { NeonButton, Rule } from '@/components/ui/neon';

/**
 * Self-serve account deletion — the danger zone.
 *
 * Two deliberate pieces of friction, because undo is impossible:
 *  1. an explicit expand step, so the button is never one stray tap away; and
 *  2. typing DELETE, which is the industry-standard "are you sure" for
 *     irreversible actions.
 *
 * On success the action has already signed the session out and cleared the
 * cookies, so the client just returns to the homepage.
 */
const CONFIRM_PHRASE = 'DELETE';

export function DeleteAccountButton({ hasActivePro }: { hasActivePro: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-ink-faint underline-offset-4 transition-colors hover:text-verdict-red hover:underline"
      >
        Delete my juror record
      </button>
    );
  }

  function confirm() {
    startTransition(async () => {
      const result = await deleteMyAccount(confirmText);

      if (!result.ok) {
        toast.error(result.error ?? 'Could not delete the account.');
        return;
      }

      toast.success('Your record has been struck from the court.');
      router.push('/');
      router.refresh();
    });
  }

  const armed = confirmText.trim().toUpperCase() === CONFIRM_PHRASE;

  return (
    <div className="panel-flat border border-verdict-red/30 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-verdict-red"
          strokeWidth={2.2}
          aria-hidden
        />
        <div>
          <p className="font-display text-lg font-bold tracking-tight text-ink">
            Strike your record from the court?
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            This permanently and irreversibly erases your account.{' '}
            {hasActivePro && (
              <span className="font-semibold text-verdict-red">
                Your active Pro pass ends immediately and is not refunded.{' '}
              </span>
            )}
            There is no undo.
          </p>
        </div>
      </div>

      <Rule className="my-5" />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="hud text-[10px] tracking-widest text-ink-faint">
            ERASED FOREVER
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            <li>· Your profile and juror handle</li>
            <li>· Every ballot you have cast</li>
            <li>· Every case you filed, with its verdict</li>
            <li>· Every report you made</li>
          </ul>
        </div>
        <div>
          <p className="hud text-[10px] tracking-widest text-ink-faint">
            KEPT, ANONYMISED
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            <li>· Payment records — accounting requires them, but they keep no
                link to you</li>
            <li>· One audit line recording that an erasure happened (counts
                only, no personal data)</li>
          </ul>
        </div>
      </div>

      <div className="mt-6">
        <label
          htmlFor="delete-confirm"
          className="text-xs font-semibold text-ink"
        >
          Type <span className="font-bold tracking-[0.2em] text-verdict-red">DELETE</span> to
          confirm
        </label>
        <input
          id="delete-confirm"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value.slice(0, 12))}
          autoComplete="off"
          spellCheck={false}
          placeholder="DELETE"
          aria-invalid={!armed}
          className="panel-sunk mt-2 w-full max-w-[12rem] p-3 text-sm font-semibold uppercase tracking-[0.2em] text-ink outline-none transition-colors focus:border-verdict-red"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <NeonButton
          size="sm"
          variant="red"
          disabled={!armed || isPending}
          onClick={confirm}
        >
          <XCircle className="size-4" strokeWidth={2.2} aria-hidden />
          {isPending ? 'Striking the record…' : 'Delete everything'}
        </NeonButton>
        <NeonButton
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setOpen(false);
            setConfirmText('');
          }}
        >
          Keep my record
        </NeonButton>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] leading-relaxed text-ink-faint">
        <Trash2 className="size-3 shrink-0" strokeWidth={2} aria-hidden />
        If the deletion is interrupted halfway, signing back in and repeating it
        simply continues where it stopped.
      </p>
    </div>
  );
}

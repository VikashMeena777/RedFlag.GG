'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, ShieldCheck, LogOut, Inbox } from 'lucide-react';
import {
  requestVerification,
  startGoogleOAuth,
  signOut,
} from '@/lib/actions/auth';
import { NeonButton, Rule } from '@/components/ui/neon';

/**
 * Verification form.
 *
 * Magic link only — there is no code to type. The previous two-step code flow
 * depended on the Supabase email template including `{{ .Token }}`, which is not
 * the default, so users kept receiving a link while the form demanded a digit
 * code. One step, one email, no configuration to get wrong.
 */
export function VerifyForm({ signedInEmail }: { signedInEmail?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  /** Set once the link is away, so the UI can explain what to do next. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  // ── Already verified ───────────────────────────────────────────────
  if (signedInEmail) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="size-5 text-verdict-green"
            strokeWidth={2}
            aria-hidden
          />
          <p className="text-sm font-medium text-ink">
            Verified as <span className="text-ink-muted">{signedInEmail}</span>
          </p>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          You can file cases and report others. Your email is never shown on any
          case.
        </p>
        <NeonButton
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() =>
            startTransition(async () => {
              await signOut();
              toast.success('Signed out. You can still vote.');
              router.refresh();
            })
          }
          disabled={isPending}
        >
          <LogOut className="size-4" strokeWidth={2} aria-hidden />
          Sign out
        </NeonButton>
      </div>
    );
  }

  // ── Link sent ──────────────────────────────────────────────────────
  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Inbox className="size-5 text-verdict-split" strokeWidth={2} aria-hidden />
          <p className="text-sm font-medium text-ink">Check your inbox</p>
        </div>

        <p className="text-sm leading-relaxed text-ink-muted">
          We sent a link to{' '}
          <span className="font-medium text-ink">{sentTo}</span>. Open it and you
          land back here verified.
        </p>

        {/*
          This caveat is load-bearing, not boilerplate. Opening the link in a
          different browser starts a fresh session, so any votes cast anonymously
          stay with the session that is being abandoned.
        */}
        <p className="text-xs leading-relaxed text-ink-faint">
          Open it in this browser — otherwise the votes you have already cast stay
          with your anonymous session.
        </p>

        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setErrors({});
          }}
          className="self-start text-xs font-medium text-ink-faint underline-offset-4 transition-colors hover:text-verdict-split hover:underline"
          disabled={isPending}
        >
          Use a different email
        </button>
      </div>
    );
  }

  function send(formData: FormData) {
    startTransition(async () => {
      setErrors({});
      const result = await requestVerification(formData);

      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) toast.error(result.error);
        return;
      }

      setSentTo(String(formData.get('email') ?? '').trim());
      toast.success('Link sent. Check your inbox.');
    });
  }

  function google() {
    startTransition(async () => {
      const result = await startGoogleOAuth();
      if (!result.ok || !result.url) {
        toast.error(result.error ?? 'Could not connect Google.');
        return;
      }
      window.location.href = result.url;
    });
  }

  // ── Ask for an email ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <form action={send} className="flex flex-col gap-3">
        <label htmlFor="email" className="hud">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className="panel-sunk w-full p-3.5 text-base text-ink outline-none transition-colors focus:border-verdict-split"
        />
        {errors.email && (
          <p id="email-error" className="text-xs font-medium text-verdict-red">
            {errors.email}
          </p>
        )}
        <NeonButton type="submit" variant="red" disabled={isPending}>
          <Mail className="size-4" strokeWidth={2} aria-hidden />
          {isPending ? 'Sending…' : 'Email me a link'}
        </NeonButton>
      </form>

      <div className="flex items-center gap-3">
        <Rule className="flex-1" />
        <span className="hud">or</span>
        <Rule className="flex-1" />
      </div>

      <NeonButton variant="outline" onClick={google} disabled={isPending}>
        Continue with Google
      </NeonButton>

      <p className="text-xs leading-relaxed text-ink-muted">
        Verifying keeps the votes you have already cast. Your email is only used to
        confirm you are a real person — it is never shown on a case.
      </p>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, ShieldCheck, LogOut, Inbox, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  requestVerification,
  startGoogleOAuth,
  signOut,
} from '@/lib/actions/auth';
import { NeonButton, Rule } from '@/components/ui/neon';

/**
 * Verification Form.
 */
export function VerifyForm({ signedInEmail }: { signedInEmail?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  if (signedInEmail) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 p-4 rounded-[4px] bg-verdict-green-soft border border-verdict-green/30">
          <CheckCircle2 className="size-5 text-verdict-green shrink-0" strokeWidth={2.2} />
          <div>
            <p className="text-sm font-bold text-ink">
              Verified Juror: <span className="text-verdict-green">{signedInEmail}</span>
            </p>
            <p className="text-xs text-ink-muted mt-0.5">
              Your account has full case filing & reporting privileges. Your email address is strictly private and never displayed on cases.
            </p>
          </div>
        </div>

        <NeonButton
          variant="ghost"
          size="sm"
          className="self-start mt-1 text-xs font-semibold text-ink-muted hover:text-ink"
          onClick={() =>
            startTransition(async () => {
              await signOut();
              toast.success('Signed out. You can still view cases and vote.');
              router.refresh();
            })
          }
          disabled={isPending}
        >
          <LogOut className="size-3.5" strokeWidth={2} aria-hidden />
          Sign out of Juror Session
        </NeonButton>
      </div>
    );
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4 p-5 rounded-[4px] bg-wash border border-rule">
        <div className="flex items-center gap-2.5">
          <Inbox className="size-5 text-verdict-split" strokeWidth={2.2} />
          <p className="text-sm font-bold text-ink">Magic Link Sent to Inbox</p>
        </div>

        <p className="text-sm leading-relaxed text-ink-muted">
          We sent an authentication link to{' '}
          <span className="font-bold text-ink">{sentTo}</span>. Open it on this device to verify instantly.
        </p>

        <p className="text-xs leading-relaxed text-ink-faint border-l-2 border-verdict-split pl-3">
          Open the link in this browser window to verify your session.
        </p>

        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setErrors({});
          }}
          className="self-start text-xs font-semibold text-verdict-split underline-offset-4 hover:underline mt-2"
          disabled={isPending}
        >
          ← Use a different email address
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
      toast.success('Magic link sent. Please check your inbox.');
    });
  }

  function google() {
    startTransition(async () => {
      const result = await startGoogleOAuth();
      if (!result.ok || !result.url) {
        toast.error(result.error ?? 'Could not connect Google OAuth.');
        return;
      }
      window.location.href = result.url;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={send} className="flex flex-col gap-3">
        <label htmlFor="email" className="hud font-semibold text-ink text-[11px]">
          Enter your email address
        </label>
        <div className="relative">
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
            className="panel-sunk w-full p-3.5 pl-10 text-sm font-medium text-ink outline-none transition-colors focus:border-verdict-split"
          />
          <Mail className="absolute left-3.5 top-3.5 size-4 text-ink-faint pointer-events-none" />
        </div>

        {errors.email && (
          <p id="email-error" className="text-xs font-semibold text-verdict-red">
            {errors.email}
          </p>
        )}

        <NeonButton type="submit" variant="red" size="md" disabled={isPending} className="self-start px-6 font-semibold uppercase text-xs tracking-wider">
          <Mail className="size-4" strokeWidth={2.2} aria-hidden />
          {isPending ? 'Sending Link…' : 'Email Me a Magic Link'}
        </NeonButton>
      </form>

      <div className="flex items-center gap-3">
        <Rule className="flex-1" />
        <span className="hud text-[10px] text-ink-faint font-semibold">OR FAST AUTH</span>
        <Rule className="flex-1" />
      </div>

      <NeonButton variant="outline" onClick={google} disabled={isPending} className="w-full sm:w-auto self-start px-6 font-semibold text-xs uppercase tracking-wider py-2.5">
        <svg className="size-4 mr-2" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        Continue with Google OAuth
      </NeonButton>

      <p className="text-xs leading-relaxed text-ink-muted">
        Verification is purely for anti-abuse and case filing rights. Your email is never published or linked publicly to your filed cases or votes.
      </p>
    </div>
  );
}

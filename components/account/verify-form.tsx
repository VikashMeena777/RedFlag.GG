'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, ShieldCheck, LogOut } from 'lucide-react';
import {
  requestVerification,
  confirmVerification,
  startGoogleOAuth,
  signOut,
} from '@/lib/actions/auth';
import { BrutButton, DocketRule } from '@/components/ui/brut';

/**
 * Verification form.
 *
 * Two steps in one component because the email must persist between them. The
 * server handles both the anonymous-upgrade path and a fresh sign-in, so this UI
 * does not need to know which one it is in — which matters, since a returning
 * visitor may already hold an anonymous session with votes attached.
 */
export function VerifyForm({ signedInEmail }: { signedInEmail?: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  if (signedInEmail) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="size-5 text-flag-green"
            strokeWidth={2.75}
            aria-hidden
          />
          <p className="text-sm font-medium text-ink">
            Verified as{' '}
            <span className="font-docket text-xs tracking-[0.08em]">
              {signedInEmail}
            </span>
          </p>
        </div>
        <p className="text-xs leading-relaxed text-ink-soft">
          You can file cases and report others. Your email is never shown on any
          case.
        </p>
        <BrutButton
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
          <LogOut className="size-4" strokeWidth={2.75} aria-hidden />
          Sign out
        </BrutButton>
      </div>
    );
  }

  function sendCode(formData: FormData) {
    startTransition(async () => {
      setErrors({});
      const result = await requestVerification(formData);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) toast.error(result.error);
        return;
      }
      setStep('code');
      toast.success('Code sent. Check your inbox.');
    });
  }

  function verify(formData: FormData) {
    formData.set('email', email);
    startTransition(async () => {
      setErrors({});
      const result = await confirmVerification(formData);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) toast.error(result.error);
        return;
      }
      toast.success('Verified. You can file cases now.');
      router.refresh();
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

  return (
    <div className="flex flex-col gap-5">
      {step === 'email' ? (
        <form action={sendCode} className="flex flex-col gap-3">
          <label htmlFor="email" className="docket-label">
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
            className="brut w-full bg-paper-bright p-3 text-base text-ink placeholder:text-ink-faint"
          />
          {errors.email && (
            <p id="email-error" className="text-xs font-medium text-flag-red">
              {errors.email}
            </p>
          )}
          <BrutButton type="submit" variant="red" disabled={isPending}>
            <Mail className="size-4" strokeWidth={2.75} aria-hidden />
            {isPending ? 'Sending…' : 'Send me a code'}
          </BrutButton>
        </form>
      ) : (
        <form action={verify} className="flex flex-col gap-3">
          <label htmlFor="token" className="docket-label">
            6-digit code sent to {email}
          </label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            placeholder="000000"
            aria-invalid={Boolean(errors.token)}
            aria-describedby={errors.token ? 'token-error' : undefined}
            className="brut w-full bg-paper-bright p-3 text-center font-docket text-2xl tracking-[0.4em] text-ink placeholder:text-ink-faint"
          />
          {errors.token && (
            <p id="token-error" className="text-xs font-medium text-flag-red">
              {errors.token}
            </p>
          )}
          <BrutButton
            type="submit"
            variant="red"
            disabled={isPending || code.length !== 6}
          >
            <ShieldCheck className="size-4" strokeWidth={2.75} aria-hidden />
            {isPending ? 'Verifying…' : 'Verify'}
          </BrutButton>
          <button
            type="button"
            onClick={() => setStep('email')}
            className="self-start font-docket text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
          >
            Use a different email
          </button>
        </form>
      )}

      <div className="flex items-center gap-3">
        <DocketRule className="flex-1" />
        <span className="font-docket text-[10px] font-bold tracking-[0.14em] text-ink-faint">
          OR
        </span>
        <DocketRule className="flex-1" />
      </div>

      <BrutButton variant="ghost" onClick={google} disabled={isPending}>
        Continue with Google
      </BrutButton>

      <p className="text-xs leading-relaxed text-ink-soft">
        Verifying keeps the votes you have already cast. Your email is only used to
        confirm you are a real person — it is never shown on a case.
      </p>
    </div>
  );
}

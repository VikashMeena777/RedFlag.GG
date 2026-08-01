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
import { NeonButton, Rule } from '@/components/ui/neon';

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
  /**
   * Whether the email actually contains a 6-digit code.
   *
   * Supabase sends one template for both magic links and OTPs; it only includes a
   * code when the template has `{{ .Token }}`. The server reports which it is, so
   * the UI never asks for a code that was never sent.
   */
  const [expectsCode, setExpectsCode] = useState(true);
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
          <p className="text-sm font-medium text-chalk">
            Verified as{' '}
            <span className="font-hud text-xs tracking-[0.08em]">
              {signedInEmail}
            </span>
          </p>
        </div>
        <p className="text-xs leading-relaxed text-chalk-dim">
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
          <LogOut className="size-4" strokeWidth={2.25} aria-hidden />
          Sign out
        </NeonButton>
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

      /*
       * Supabase sends ONE template for magic links and codes. If the project
       * still uses the default `{{ .ConfirmationURL }}` template, no code is in
       * the email — so telling the user to type one makes the app look broken.
       * `expectsCode` reflects how the template is configured.
       */
      setExpectsCode(result.expectsCode !== false);
      setStep('code');
      toast.success(
        result.expectsCode === false
          ? 'Check your inbox and click the link.'
          : 'Code sent. Check your inbox.'
      );
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
            className="panel-sunk w-full p-3.5 text-base text-chalk outline-none transition-colors focus:border-judge"
          />
          {errors.email && (
            <p id="email-error" className="text-xs font-medium text-flag-red">
              {errors.email}
            </p>
          )}
          <NeonButton type="submit" variant="red" disabled={isPending}>
            <Mail className="size-4" strokeWidth={2.25} aria-hidden />
            {isPending ? 'Sending…' : 'Send me a code'}
          </NeonButton>
        </form>
      ) : (
        <form action={verify} className="flex flex-col gap-3">
          <label htmlFor="token" className="hud">
            {expectsCode
              ? `6-digit code sent to ${email}`
              : `Link sent to ${email}`}
          </label>

          {/*
            Link-only template: no code exists to type, so showing a code input
            would be asking for something that was never sent.
          */}
          {!expectsCode ? (
            <div className="panel-flat p-5">
              <p className="text-sm leading-relaxed text-chalk">
                Open the email and click <strong>Confirm</strong>. You will land
                back here verified.
              </p>
              <p className="mt-2.5 text-xs leading-relaxed text-chalk-dim">
                Use the same browser you are in now, otherwise the votes you have
                already cast will stay with your anonymous session.
              </p>
            </div>
          ) : (
            <>
              <input
                id="token"
                name="token"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                required
                placeholder="000000"
                aria-invalid={Boolean(errors.token)}
                aria-describedby={errors.token ? 'token-error' : undefined}
                className="panel-sunk w-full p-3.5 text-center font-hud text-2xl tracking-[0.4em] text-chalk outline-none transition-colors focus:border-judge"
              />
              {errors.token && (
                <p id="token-error" className="text-xs font-medium text-flag-red">
                  {errors.token}
                </p>
              )}
              <NeonButton
                type="submit"
                variant="red"
                disabled={isPending || code.length !== 6}
              >
                <ShieldCheck className="size-4" strokeWidth={2.25} aria-hidden />
                {isPending ? 'Verifying…' : 'Verify'}
              </NeonButton>
              <p className="text-xs leading-relaxed text-chalk-dim">
                No code in the email? Click the link inside it instead — that works
                too.
              </p>
            </>
          )}

          <button
            type="button"
            onClick={() => setStep('email')}
            className="self-start text-xs font-medium text-chalk-faint underline-offset-4 transition-colors hover:text-judge hover:underline"
          >
            Use a different email
          </button>
        </form>
      )}

      <div className="flex items-center gap-3">
        <Rule className="flex-1" />
        <span className="font-hud text-[10px] font-medium uppercase tracking-[0.18em] text-chalk-faint">
          or
        </span>
        <Rule className="flex-1" />
      </div>

      <NeonButton variant="glass" onClick={google} disabled={isPending}>
        Continue with Google
      </NeonButton>

      <p className="text-xs leading-relaxed text-chalk-dim">
        Verifying keeps the votes you have already cast. Your email is only used to
        confirm you are a real person — it is never shown on a case.
      </p>
    </div>
  );
}

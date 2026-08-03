'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PenLine, ShieldAlert, Check, Scale, Zap, Coffee } from 'lucide-react';
import { fileCase } from '@/lib/actions/cases';
import { NeonButton, Rule } from '@/components/ui/neon';
import { cn } from '@/lib/utils';
import {
  CASE_CATEGORIES,
  CATEGORY_LABELS,
  JUDGE_PERSONAS,
  PERSONA_LABELS,
  DEFAULT_PERSONA,
  TITLE_MAX,
  BODY_MAX,
  BODY_MIN,
  type CaseCategory,
  type JudgePersona,
} from '@/lib/types';

const PERSONA_DETAILS: Record<
  JudgePersona,
  { title: string; desc: string; icon: React.ComponentType<{ className?: string }> }
> = {
  judge_roast: {
    title: 'Judge Roast',
    desc: 'High-energy, dramatic, and brutally hilarious roasts.',
    icon: Zap,
  },
  judge_calm: {
    title: 'Judge Calm',
    desc: 'Empathetic, balanced, and pragmatically honest.',
    icon: Coffee,
  },
  judge_petty: {
    title: 'Judge Petty',
    desc: 'Focuses on the smallest details and petty behaviors.',
    icon: Scale,
  },
};

/**
 * Enhanced Case Filing Form.
 */
export function FileCaseForm() {
  const router = useRouter();
  const [category, setCategory] = useState<CaseCategory>('dating');
  const [persona, setPersona] = useState<JudgePersona>(DEFAULT_PERSONA);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    formData.set('category', category);
    formData.set('persona', persona);

    startTransition(async () => {
      setErrors({});
      const result = await fileCase(formData);

      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) toast.error(result.error);
        return;
      }

      toast.success('Case filed. The jury is in session.');
      router.push(`/case/${result.publicId}`);
    });
  }

  const bodyCount = body.trim().length;
  const shortBy = BODY_MIN - bodyCount;

  return (
    <form action={submit} className="flex flex-col gap-8 bg-surface p-6 sm:p-9 rounded-[6px] border border-rule shadow-xs">
      {/* Category selection */}
      <fieldset>
        <legend className="hud mb-3 font-semibold text-ink">1. Select Case Category</legend>
        <div className="flex flex-wrap gap-2">
          {CASE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={cn(
                'pill border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all',
                category === cat
                  ? 'border-verdict-red bg-verdict-red text-white shadow-xs'
                  : 'border-rule bg-page text-ink-muted hover:border-rule-strong hover:text-ink'
              )}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Judge Persona visual selection cards */}
      <fieldset>
        <legend className="hud mb-3 font-semibold text-ink">2. Choose Your Presiding Judge</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {JUDGE_PERSONAS.map((p) => {
            const detail = PERSONA_DETAILS[p];
            const Icon = detail.icon;
            const isSelected = persona === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPersona(p)}
                aria-pressed={isSelected}
                className={cn(
                  'flex flex-col items-start p-4 rounded-[4px] border text-left transition-all',
                  isSelected
                    ? 'border-verdict-split bg-verdict-split-soft shadow-xs ring-1 ring-verdict-split'
                    : 'border-rule bg-page hover:border-rule-strong'
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={cn('size-4', isSelected ? 'text-verdict-split' : 'text-ink-muted')} />
                  <span className={cn('font-display text-base font-bold', isSelected ? 'text-verdict-split' : 'text-ink')}>
                    {detail.title}
                  </span>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">
                  {detail.desc}
                </p>
              </button>
            );
          })}
        </div>
      </fieldset>

      <Rule />

      {/* Case Title */}
      <div>
        <label htmlFor="title" className="hud mb-2 block font-semibold text-ink">
          3. The Charge — One Line Summary
        </label>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          required
          placeholder="e.g. Liked their ex's post 4 seconds after our anniversary dinner"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'title-error' : undefined}
          className="panel-sunk w-full p-3.5 text-base text-ink font-medium outline-none transition-colors focus:border-verdict-split"
        />
        <div className="mt-2 flex justify-between gap-3 text-xs">
          {errors.title ? (
            <p id="title-error" className="font-semibold text-verdict-red">
              {errors.title}
            </p>
          ) : (
            <span />
          )}
          <span className="hud shrink-0 text-ink-faint">
            {title.length}/{TITLE_MAX}
          </span>
        </div>
      </div>

      {/* Case Body */}
      <div>
        <label htmlFor="body" className="hud mb-2 block font-semibold text-ink">
          4. The Evidence — Full Story & Timeline
        </label>
        <textarea
          id="body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={8}
          required
          placeholder="Give the jury the full context. What happened, who said what, and why you feel red-flagged. Remember: NO real names, handles, workplaces, or addresses."
          aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? 'body-error' : 'body-hint'}
          className="panel-sunk w-full resize-y p-3.5 text-[15px] leading-relaxed text-ink outline-none transition-colors focus:border-verdict-split"
        />
        <div className="mt-2 flex justify-between gap-3 text-xs">
          {errors.body ? (
            <p id="body-error" className="font-semibold text-verdict-red">
              {errors.body}
            </p>
          ) : (
            <p
              id="body-hint"
              className={cn(
                'font-medium',
                shortBy > 0 ? 'text-ink-faint' : 'text-verdict-green'
              )}
            >
              {shortBy > 0
                ? `${shortBy} more characters required for the jury`
                : '✓ Detailed & ready for verdict'}
            </p>
          )}
          <span className="hud shrink-0 text-ink-faint">
            {bodyCount}/{BODY_MAX}
          </span>
        </div>
      </div>

      {/* Court Rules Consent */}
      <div className="rounded-[4px] bg-wash/80 p-5 border border-rule">
        <p className="hud mb-3 flex items-center gap-2 font-bold text-heat">
          <ShieldAlert className="size-4" strokeWidth={2} />
          MANDATORY COURT RULES & PRIVACY CONSTRAINTS
        </p>
        <ul className="mb-4 space-y-1.5 text-xs text-ink-muted leading-relaxed list-disc list-inside">
          <li>No real names, @social handles, phone numbers, or email addresses.</li>
          <li>No workplace names, schools, or identifying locations.</li>
          <li>No photos or personal identification of any individual.</li>
          <li>All involved parties must be 18 years of age or older.</li>
        </ul>

        <label className="flex cursor-pointer items-start gap-3 pt-2 border-t border-rule/60">
          <input
            type="checkbox"
            name="acceptedRules"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            required
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[3px] border transition-colors',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-verdict-split',
              accepted
                ? 'border-verdict-green bg-verdict-green text-white'
                : 'border-rule-strong bg-surface'
            )}
          >
            {accepted && <Check className="size-3.5" strokeWidth={2.5} />}
          </span>
          <span className="text-xs font-semibold leading-relaxed text-ink">
            I solemnly confirm this story contains no private personal data, and everyone involved is 18+.
          </span>
        </label>

        {errors.acceptedRules && (
          <p className="mt-2 text-xs font-semibold text-verdict-red">
            {errors.acceptedRules}
          </p>
        )}
      </div>

      <NeonButton
        type="submit"
        variant="red"
        size="lg"
        disabled={isPending || !accepted || bodyCount < BODY_MIN}
        className="w-full sm:w-auto self-start px-8 py-3.5 text-sm font-semibold uppercase tracking-wider shadow-xs"
      >
        <PenLine className="size-4" strokeWidth={2.2} />
        {isPending ? 'Submitting to Jury…' : 'File Case to Court'}
      </NeonButton>
    </form>
  );
}

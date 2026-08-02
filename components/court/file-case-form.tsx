'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PenLine, ShieldAlert, Check } from 'lucide-react';
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

/**
 * Case filing form.
 *
 * The rules checkbox is not decoration — it is the consent record for the
 * no-doxxing policy, and the server rejects a submission without it. Hard PII
 * violations come back as field errors so the author learns the rule rather than
 * having their text silently rewritten.
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
    // Both are controlled by buttons rather than native inputs, so they are set
    // here instead of relying on form serialisation.
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

      toast.success('Case filed. The jury is in.');
      router.push(`/case/${result.publicId}`);
    });
  }

  const bodyCount = body.trim().length;
  const shortBy = BODY_MIN - bodyCount;

  return (
    <form action={submit} className="flex flex-col gap-7">
      {/* Category */}
      <fieldset>
        <legend className="hud mb-3">Category</legend>
        <div className="flex flex-wrap gap-2">
          {CASE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={cn(
                'pill border px-4 py-2 text-[13px]',
                category === cat
                  ? 'border-verdict-red/60 bg-verdict-red-soft text-verdict-red'
                  : 'border-rule bg-surface text-ink-muted hover:border-rule-strong hover:text-ink'
              )}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Judge persona — who hears the case changes the tone of the verdict. */}
      <fieldset>
        <legend className="hud mb-3">Pick your judge</legend>
        <div className="flex flex-wrap gap-2">
          {JUDGE_PERSONAS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPersona(p)}
              aria-pressed={persona === p}
              className={cn(
                'pill border px-4 py-2 text-[13px]',
                persona === p
                  ? 'border-verdict-split/60 bg-verdict-split-soft text-verdict-split'
                  : 'border-rule bg-surface text-ink-muted hover:border-rule-strong hover:text-ink'
              )}
            >
              {PERSONA_LABELS[p]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Title */}
      <div>
        <label htmlFor="title" className="hud mb-2.5 block">
          The charge — one line
        </label>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          required
          placeholder="He liked her post 4 seconds after our fight"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'title-error' : undefined}
          className="panel-sunk w-full p-3.5 text-base text-ink outline-none transition-colors focus:border-verdict-split"
        />
        <div className="mt-2 flex justify-between gap-3">
          {errors.title ? (
            <p id="title-error" className="text-xs font-medium text-verdict-red">
              {errors.title}
            </p>
          ) : (
            <span />
          )}
          <span className="hud shrink-0">
            {title.length}/{TITLE_MAX}
          </span>
        </div>
      </div>

      {/* Body */}
      <div>
        <label htmlFor="body" className="hud mb-2.5 block">
          The evidence — what actually happened
        </label>
        <textarea
          id="body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={9}
          required
          placeholder="Give the jury the full timeline. No names, no @s, no schools, no workplaces."
          aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? 'body-error' : 'body-hint'}
          className="panel-sunk w-full resize-y p-3.5 text-[15px] leading-relaxed text-ink outline-none transition-colors focus:border-verdict-split"
        />
        <div className="mt-2 flex justify-between gap-3">
          {errors.body ? (
            <p id="body-error" className="text-xs font-medium text-verdict-red">
              {errors.body}
            </p>
          ) : (
            <p
              id="body-hint"
              className={cn(
                'text-xs',
                shortBy > 0 ? 'text-ink-faint' : 'text-verdict-green'
              )}
            >
              {shortBy > 0
                ? `${shortBy} more characters needed`
                : 'Ready for the jury'}
            </p>
          )}
          <span className="hud shrink-0">
            {bodyCount}/{BODY_MAX}
          </span>
        </div>
      </div>

      <Rule />

      {/* Rules consent */}
      <div className="panel-flat p-5">
        <p className="hud mb-3.5 flex items-center gap-2 text-heat">
          <ShieldAlert className="size-4" strokeWidth={2} aria-hidden />
          Court rules
        </p>
        <ul className="mb-5 space-y-2 text-xs leading-relaxed text-ink-muted">
          <li>No names, @handles, phone numbers, emails, or links.</li>
          <li>No schools, workplaces, or anything that identifies someone.</li>
          <li>No screenshots or photos of real people.</li>
          <li>Nothing involving anyone under 18.</li>
          <li>
            Your case can be removed and your account can lose filing rights.
          </li>
        </ul>

        {/*
          Custom checkbox: a native one cannot be styled to match the editorial
          register. The real input stays in the DOM (sr-only) so the form still
          submits `acceptedRules` and `required` validation applies.
        */}
        <label className="flex cursor-pointer items-start gap-3">
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
            {accepted && <Check className="size-3.5" strokeWidth={2} />}
          </span>
          <span className="text-xs font-medium leading-relaxed text-ink">
            I confirm this story identifies nobody, and everyone involved is 18 or
            over.
          </span>
        </label>

        {errors.acceptedRules && (
          <p className="mt-2.5 text-xs font-medium text-verdict-red">
            {errors.acceptedRules}
          </p>
        )}
      </div>

      <NeonButton
        type="submit"
        variant="red"
        size="lg"
        disabled={isPending || !accepted || bodyCount < BODY_MIN}
      >
        <PenLine className="size-4" strokeWidth={2} aria-hidden />
        {isPending ? 'Filing…' : 'File the case'}
      </NeonButton>
    </form>
  );
}

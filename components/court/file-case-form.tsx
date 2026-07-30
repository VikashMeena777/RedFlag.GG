'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FilePlus2, ShieldAlert } from 'lucide-react';
import { fileCase } from '@/lib/actions/cases';
import { BrutButton, DocketRule } from '@/components/ui/brut';
import { cn } from '@/lib/utils';
import {
  CASE_CATEGORIES,
  CATEGORY_LABELS,
  TITLE_MAX,
  BODY_MAX,
  BODY_MIN,
  type CaseCategory,
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
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    formData.set('category', category);
    startTransition(async () => {
      setErrors({});
      const result = await fileCase(formData);

      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) toast.error(result.error);
        return;
      }

      toast.success('Case filed. The jury is in.');
      router.push(`/case/${result.slug}`);
    });
  }

  const bodyCount = body.trim().length;

  return (
    <form action={submit} className="flex flex-col gap-6">
      {/* Category */}
      <fieldset>
        <legend className="docket-label mb-2.5">Category</legend>
        <div className="flex flex-wrap gap-2">
          {CASE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={cn(
                'brut-thin brut-press px-3 py-2 font-docket text-[11px] font-bold uppercase tracking-[0.12em] transition-colors',
                category === cat
                  ? 'brut-shadow-sm bg-ink text-paper'
                  : 'bg-tape text-ink hover:bg-highlighter'
              )}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Title */}
      <div>
        <label htmlFor="title" className="docket-label mb-2 block">
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
          className="brut w-full bg-paper-bright p-3 text-base text-ink placeholder:text-ink-faint"
        />
        <div className="mt-1.5 flex justify-between">
          {errors.title ? (
            <p id="title-error" className="text-xs font-medium text-flag-red">
              {errors.title}
            </p>
          ) : (
            <span />
          )}
          <span className="font-docket text-[10px] tracking-[0.1em] text-ink-faint">
            {title.length}/{TITLE_MAX}
          </span>
        </div>
      </div>

      {/* Body */}
      <div>
        <label htmlFor="body" className="docket-label mb-2 block">
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
          className="brut w-full resize-y bg-paper-bright p-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-faint"
        />
        <div className="mt-1.5 flex justify-between gap-3">
          {errors.body ? (
            <p id="body-error" className="text-xs font-medium text-flag-red">
              {errors.body}
            </p>
          ) : (
            <p id="body-hint" className="text-xs text-ink-faint">
              {bodyCount < BODY_MIN
                ? `${BODY_MIN - bodyCount} more characters needed`
                : 'Ready for the jury'}
            </p>
          )}
          <span className="shrink-0 font-docket text-[10px] tracking-[0.1em] text-ink-faint">
            {bodyCount}/{BODY_MAX}
          </span>
        </div>
      </div>

      <DocketRule />

      {/* Rules consent */}
      <div className="brut bg-paper-dim p-4">
        <p className="mb-3 flex items-center gap-2 font-docket text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
          <ShieldAlert className="size-4" strokeWidth={2.75} aria-hidden />
          Court rules
        </p>
        <ul className="mb-4 space-y-1.5 text-xs leading-relaxed text-ink-soft">
          <li>· No names, @handles, phone numbers, emails, or links.</li>
          <li>· No schools, workplaces, or anything that identifies someone.</li>
          <li>· No screenshots or photos of real people.</li>
          <li>· Nothing involving anyone under 18.</li>
          <li>· Your case can be removed and your account can lose filing rights.</li>
        </ul>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            name="acceptedRules"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            required
            className="brut-thin mt-0.5 size-5 shrink-0 accent-flag-red"
          />
          <span className="text-xs font-medium leading-relaxed text-ink">
            I confirm this story identifies nobody, and everyone involved is 18 or
            over.
          </span>
        </label>
        {errors.acceptedRules && (
          <p className="mt-2 text-xs font-medium text-flag-red">
            {errors.acceptedRules}
          </p>
        )}
      </div>

      <BrutButton
        type="submit"
        variant="red"
        size="lg"
        disabled={isPending || !accepted || bodyCount < BODY_MIN}
      >
        <FilePlus2 className="size-4" strokeWidth={2.75} aria-hidden />
        {isPending ? 'Filing…' : 'File the case'}
      </BrutButton>
    </form>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert, Gavel, EyeOff, Scale } from 'lucide-react';
import { BrutCard, DocketRule } from '@/components/ui/brut';
import { AUTO_HIDE_FLAGS, MAX_STRIKES } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Court rules',
  description:
    'How RedFlag.GG works, what is not allowed, and how anonymity and moderation are handled.',
};

/**
 * Rules and privacy.
 *
 * Written plainly rather than as legalese: the people who need to read this are
 * 19 and about to post about their ex. Vague policy gets ignored.
 */
export default function RulesPage() {
  return (
    <div className="court-container py-8 sm:py-12">
      <p className="docket-label">The fine print</p>
      <h1 className="mt-2 text-[clamp(2rem,9vw,3.25rem)] leading-[0.92] text-ink">
        COURT RULES
      </h1>

      <div className="mt-8 flex flex-col gap-5">
        <BrutCard className="p-5">
          <h2 className="flex items-center gap-2 text-xl text-ink">
            <EyeOff className="size-5" strokeWidth={2.75} aria-hidden />
            Never identify anyone
          </h2>
          <DocketRule className="my-4" />
          <ul className="space-y-2 text-sm leading-relaxed text-ink">
            <li>
              · No names, @handles, phone numbers, emails, or links. The form
              rejects these outright.
            </li>
            <li>
              · No schools, workplaces, teams, or anything that narrows someone
              down.
            </li>
            <li>· No photos or screenshots of real people.</li>
            <li>· Nothing involving anyone under 18. This one is absolute.</li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink-soft">
            Some identifiers are masked automatically, but that is a safety net,
            not permission. Write the story so nobody could be found from it.
          </p>
        </BrutCard>

        <BrutCard className="p-5">
          <h2 className="flex items-center gap-2 text-xl text-ink">
            <Scale className="size-5" strokeWidth={2.75} aria-hidden />
            Who can do what
          </h2>
          <DocketRule className="my-4" />
          <ul className="space-y-2 text-sm leading-relaxed text-ink">
            <li>
              · <strong>Anyone can vote.</strong> No signup. Your ballot is
              anonymous.
            </li>
            <li>
              · <strong>Filing needs a verified account.</strong> These stories
              are about real people, so the court keeps an internal record of who
              filed what. Readers never see it.
            </li>
            <li>
              · <strong>Verified votes count more</strong> than anonymous ones, so
              a cleared browser cache cannot swing a case.
            </li>
            <li>
              · <strong>Reporting needs a verified account</strong> too, because{' '}
              {AUTO_HIDE_FLAGS} reports hide a case and that power needs a name
              behind it.
            </li>
          </ul>
        </BrutCard>

        <BrutCard className="p-5">
          <h2 className="flex items-center gap-2 text-xl text-ink">
            <Gavel className="size-5" strokeWidth={2.75} aria-hidden />
            How a case runs
          </h2>
          <DocketRule className="my-4" />
          <ol className="space-y-2 text-sm leading-relaxed text-ink">
            <li>1. You file. The case opens for the jury.</li>
            <li>
              2. The public votes red flag or green flag for up to 12 hours, or
              until 100 weighted votes land.
            </li>
            <li>
              3. The gavel drops. The AI judge reads the story and the jury split,
              then issues a verdict, a roast, a sentence, and a toxicity score.
            </li>
            <li>4. The verdict is final and the case locks.</li>
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-ink-soft">
            Verdicts are AI-generated entertainment. They are not advice, therapy,
            or a factual finding about any real person.
          </p>
        </BrutCard>

        <BrutCard className="p-5">
          <h2 className="flex items-center gap-2 text-xl text-ink">
            <ShieldAlert className="size-5" strokeWidth={2.75} aria-hidden />
            Moderation
          </h2>
          <DocketRule className="my-4" />
          <ul className="space-y-2 text-sm leading-relaxed text-ink">
            <li>
              · {AUTO_HIDE_FLAGS} reports from different accounts hide a case
              pending review.
            </li>
            <li>
              · Removed cases count as a strike. {MAX_STRIKES} strikes and the
              account loses filing rights permanently.
            </li>
            <li>
              · Slurs and targeted hate are rejected at submission. Ordinary
              swearing is fine — this is a site about drama.
            </li>
          </ul>
        </BrutCard>

        <BrutCard className="p-5">
          <h2 className="text-xl text-ink">Your data</h2>
          <DocketRule className="my-4" />
          <ul className="space-y-2 text-sm leading-relaxed text-ink">
            <li>
              · Cases are public and anonymous to readers. Your email is never
              displayed.
            </li>
            <li>
              · To stop repeat voting from one device, anonymous ballots store a
              one-way hash of your connection details. The raw values are never
              stored and cannot be recovered from the hash.
            </li>
            <li>· Deleting your account removes your cases and your votes.</li>
          </ul>
        </BrutCard>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="brut brut-shadow brut-press inline-flex items-center gap-2 bg-highlighter px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-ink"
        >
          Back to the docket
        </Link>
        <Link
          href="/file"
          className="brut brut-shadow brut-press inline-flex items-center gap-2 bg-flag-red px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-paper-bright"
        >
          File a case
        </Link>
      </div>
    </div>
  );
}

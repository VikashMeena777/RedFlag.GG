import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert, Gavel, EyeOff, Scale } from 'lucide-react';
import { Panel, Rule } from '@/components/ui/neon';
import { AUTO_HIDE_REPORTS, MAX_STRIKES } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Court rules',
  description:
    'How RedFlag.gg works, what is not allowed, and how anonymity and moderation are handled.',
};

/**
 * Rules and privacy.
 *
 * Written plainly rather than as legalese: the people who need to read this are
 * 19 and about to post about their ex. Vague policy gets ignored.
 */
export default function RulesPage() {
  return (
    <div className="court-container py-10 sm:py-14">
      <p className="hud">The fine print</p>
      <h1 className="mt-3 font-display text-[clamp(2.2rem,10vw,3.4rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
        <span className="chrome">Court rules</span>
      </h1>

      <div className="mt-9 flex flex-col gap-4">
        <Panel className="p-6">
          <h2 className="flex items-center gap-2.5 font-display text-xl font-bold tracking-[-0.035em] text-chalk">
            <EyeOff className="size-5 text-flag-red" strokeWidth={2.25} aria-hidden />
            Never identify anyone
          </h2>
          <Rule className="my-5" />
          <ul className="space-y-2.5 text-sm leading-relaxed text-chalk-dim">
            <li>No names, @handles, phone numbers, emails, or links. The form rejects these outright.</li>
            <li>No schools, workplaces, teams, or anything that narrows someone down.</li>
            <li>No photos or screenshots of real people.</li>
            <li>Nothing involving anyone under 18. This one is absolute.</li>
          </ul>
          <p className="mt-5 text-xs leading-relaxed text-chalk-faint">
            Some identifiers are masked automatically, but that is a safety net,
            not permission. Write the story so nobody could be found from it.
          </p>
        </Panel>

        <Panel className="p-6">
          <h2 className="flex items-center gap-2.5 font-display text-xl font-bold tracking-[-0.035em] text-chalk">
            <Scale className="size-5 text-judge" strokeWidth={2.25} aria-hidden />
            Who can do what
          </h2>
          <Rule className="my-5" />
          <ul className="space-y-2.5 text-sm leading-relaxed text-chalk-dim">
            <li>
              <strong className="font-semibold text-chalk">Anyone can vote.</strong>{' '}
              No signup. Your ballot is anonymous.
            </li>
            <li>
              <strong className="font-semibold text-chalk">
                Filing needs a verified account.
              </strong>{' '}
              These stories are about real people, so the court keeps an internal
              record of who filed what. Readers never see it.
            </li>
            <li>
              <strong className="font-semibold text-chalk">
                Verified votes count more
              </strong>{' '}
              than anonymous ones, so a cleared browser cache cannot swing a case.
            </li>
            <li>
              <strong className="font-semibold text-chalk">
                Reporting needs a verified account
              </strong>{' '}
              too, because {AUTO_HIDE_REPORTS} reports hide a case and that power
              needs a name behind it.
            </li>
          </ul>
        </Panel>

        <Panel className="p-6">
          <h2 className="flex items-center gap-2.5 font-display text-xl font-bold tracking-[-0.035em] text-chalk">
            <Gavel className="size-5 text-flag-green" strokeWidth={2.25} aria-hidden />
            How a case runs
          </h2>
          <Rule className="my-5" />
          <ol className="space-y-3 text-sm leading-relaxed text-chalk-dim">
            {[
              'You file. The case opens for the jury.',
              'The public votes red flag or green flag for up to 12 hours, or until 100 weighted votes land.',
              'The gavel drops. The AI judge reads the story and the jury split, then issues a verdict, a roast and a toxicity score.',
              'The verdict is final and the case locks.',
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 font-hud text-[10px] font-bold text-judge">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-xs leading-relaxed text-chalk-faint">
            Verdicts are AI-generated entertainment. They are not advice, therapy,
            or a factual finding about any real person.
          </p>
        </Panel>

        <Panel className="p-6">
          <h2 className="flex items-center gap-2.5 font-display text-xl font-bold tracking-[-0.035em] text-chalk">
            <ShieldAlert className="size-5 text-heat" strokeWidth={2.25} aria-hidden />
            Moderation
          </h2>
          <Rule className="my-5" />
          <ul className="space-y-2.5 text-sm leading-relaxed text-chalk-dim">
            <li>
              {AUTO_HIDE_REPORTS} reports from different accounts hide a case
              pending review.
            </li>
            <li>
              Removed cases count as a strike. {MAX_STRIKES} strikes and the
              account loses filing rights permanently.
            </li>
            <li>
              Slurs and targeted hate are rejected at submission. Ordinary
              swearing is fine — this is a site about drama.
            </li>
          </ul>
        </Panel>

        <Panel className="p-6">
          <h2 className="font-display text-xl font-bold tracking-[-0.035em] text-chalk">
            Your data
          </h2>
          <Rule className="my-5" />
          <ul className="space-y-2.5 text-sm leading-relaxed text-chalk-dim">
            <li>
              Cases are public and anonymous to readers. Your email is never
              displayed.
            </li>
            <li>
              To stop repeat voting from one device, anonymous ballots store a
              one-way hash of your connection details. The raw values are never
              stored and cannot be recovered from the hash.
            </li>
            <li>Deleting your account removes your cases and your votes.</li>
          </ul>
        </Panel>
      </div>

      <div className="mt-9 flex flex-wrap gap-2.5">
        <Link href="/" className="pill pill-glass px-5 py-3 text-sm">
          Back to the docket
        </Link>
        <Link href="/file" className="pill pill-red px-5 py-3 text-sm">
          File a case
        </Link>
      </div>
    </div>
  );
}

/**
 * Seeds the database with realistic cases across every state.
 *
 * Run: npm run seed
 *
 * Uses the service role, so it bypasses RLS and the privileged-column guards.
 * Writes verdicts directly rather than calling the AI, so it is fast and
 * deterministic. **Never point this at production.**
 *
 * Safe to re-run: it skips seeding entirely if enough cases already exist, so an
 * accidental second run does not flood the docket.
 */

import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import type { Database } from '../lib/supabase/database.types';
import type { CaseCategory, VerdictKind, JudgePersona } from '../lib/types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Run with: npm run seed  (loads .env.local)'
  );
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface SeedCase {
  category: CaseCategory;
  persona: JudgePersona;
  title: string;
  body: string;
  state: 'open' | 'closing' | 'closed';
  redWeight?: number;
  greenWeight?: number;
  verdict?: {
    verdict: VerdictKind;
    headline: string;
    roast: string;
    summary: string;
    toxicity: number;
  };
}

const CASES: SeedCase[] = [
  {
    category: 'dating',
    persona: 'judge_roast',
    title: 'He calls me his "best friend" to his friends',
    body: 'Eight months of dates, flowers, meeting his sister. Last week at a party someone asked who I was and he said "oh this is my best friend". I laughed it off in front of everyone and then cried in an Uber for twenty minutes. When I brought it up he said I was "putting labels on things too fast". Eight months.',
    state: 'closed',
    redWeight: 284,
    greenWeight: 19,
    verdict: {
      verdict: 'red',
      headline: 'GUILTY OF LABEL COWARDICE',
      roast:
        'Eight months in and you got demoted to a supporting character at his own party. He is not confused about labels, he is comfortable with the ambiguity. Those are different problems and only one of them is yours.',
      summary: 'Eight months, no title',
      toxicity: 86,
    },
  },
  {
    category: 'dating',
    persona: 'judge_roast',
    title: 'She liked her ex\u2019s photo 4 seconds after our fight',
    body: 'We had a bad argument about her not texting back for a full day. I went to cool off. Came back and saw she had liked a photo of her ex from 2022, four seconds after I left the call. She says the algorithm just showed it to her. I know it is a small thing but the timing feels surgical.',
    state: 'closed',
    redWeight: 141,
    greenWeight: 122,
    verdict: {
      verdict: 'red',
      headline: 'THE TIMING WAS THE MESSAGE',
      roast:
        'Nobody accidentally excavates a 2022 photo four seconds after a fight. That was not the algorithm, that was a flare shot into the sky. The jury nearly split because it is small, and it is small, but small on purpose still counts.',
      summary: 'Surgical timing, four seconds',
      toxicity: 61,
    },
  },
  {
    category: 'friendship',
    persona: 'judge_calm',
    title: 'My bestie told everyone the thing I told her once',
    body: 'I told her one thing. One. About something medical that I have not told my own family about. Three weeks later a girl from our wider group asked me how I was "coping with everything". I have never felt so exposed. My friend says she only told one person and that person "must have spread it".',
    state: 'closed',
    redWeight: 402,
    greenWeight: 8,
    verdict: {
      verdict: 'red',
      headline: 'CONFIDENCE BREACHED, CASE CLOSED',
      roast:
        'She did not tell one person, she opened a distribution channel and then blamed the channel. Medical information you have not given your own family is not social currency. The "must have spread it" defence is the tell.',
      summary: 'Medical secret, leaked',
      toxicity: 94,
    },
  },
  {
    category: 'dating',
    persona: 'judge_calm',
    title: 'He drove 90 minutes to bring me soup at 2am',
    body: 'I mentioned offhand on a call that I felt awful and could not get out of bed. Two hours later he is at my door with soup, medicine and a phone charger because he remembered mine was broken. We have been dating for five weeks. I am so used to being disappointed that my first reaction was suspicion. Is this normal or am I broken?',
    state: 'closed',
    redWeight: 12,
    greenWeight: 388,
    verdict: {
      verdict: 'green',
      headline: 'ACQUITTED ON ALL COUNTS',
      roast:
        'He remembered the charger. Five weeks in, unprompted, at 2am. The concerning party in this filing is whoever trained you to read basic care as a trap. Keep him, and be suspicious of the people who made that your first instinct.',
      summary: 'Soup at 2am, no notes',
      toxicity: 4,
    },
  },
  {
    category: 'work',
    persona: 'judge_petty',
    title: 'My manager takes credit in every single meeting',
    body: 'I built the entire reporting pipeline. Every leadership meeting he presents it as "the work my team has been doing" and then answers all the technical questions wrong. When I corrected one detail he pulled me aside afterwards and said I had "undermined" him in front of his boss.',
    state: 'closed',
    redWeight: 267,
    greenWeight: 31,
    verdict: {
      verdict: 'red',
      headline: 'STOLEN VALOUR, BADLY',
      roast:
        'He takes the credit and then fumbles the questions, which means he wants the applause without the exam. Being corrected is not undermining. Getting caught not understanding your own presentation is.',
      summary: 'Credit theft, poor execution',
      toxicity: 79,
    },
  },
  {
    category: 'family',
    persona: 'judge_calm',
    title: 'They compare me to my cousin at every gathering',
    body: 'Every single function. Her marks, her job, her marriage, her weight. I got a promotion last month and my mother said "that is nice, did you hear your cousin bought a flat". I have stopped mentioning good news at home because it just becomes the setup for a comparison.',
    state: 'closed',
    redWeight: 318,
    greenWeight: 24,
    verdict: {
      verdict: 'red',
      headline: 'CONVICTED OF SCOREBOARD PARENTING',
      roast:
        'You brought a promotion and got handed a leaderboard. When good news reliably becomes a setup, the safest move is exactly what you did: stop supplying material. That is not distance, that is maintenance.',
      summary: 'Promotion, then a leaderboard',
      toxicity: 82,
    },
  },
  {
    category: 'dating',
    persona: 'judge_roast',
    title: 'Six months of "I am not ready for anything serious"',
    body: 'Six months. He says he is not ready for anything serious but calls me every night, gets jealous when I mention other people, and last weekend introduced me to his mother by accident. When I asked what we are doing he said "why does it need a name" and then did not text for two days.',
    state: 'open',
    redWeight: 47,
    greenWeight: 6,
  },
  {
    category: 'friendship',
    persona: 'judge_roast',
    title: 'She only texts me when her relationship is bad',
    body: 'Three years of this pattern. They fight, I get four hours of voice notes. They make up, I get radio silence for a month. I sent her a message about something big in my own life and got a thumbs up reaction. Two days later she called crying about him for an hour.',
    state: 'open',
    redWeight: 31,
    greenWeight: 4,
  },
  {
    category: 'dating',
    persona: 'judge_petty',
    title: 'He still has a drawer of his ex\u2019s things',
    body: 'Two years post-breakup, one full drawer of her stuff in his bedroom. Not photos, actual clothing and a hairbrush. He says throwing it out would be "dramatic" and she might want it back someday. She lives in another country now and they do not speak.',
    state: 'closing',
    redWeight: 88,
    greenWeight: 9,
  },
  {
    category: 'work',
    persona: 'judge_petty',
    title: 'A colleague keeps taking my lunch from the office fridge',
    body: 'Labelled. Clearly labelled with my name in marker. Four times now. Last week I watched him eat it at his desk while making eye contact with me. When I asked he said he "assumed it was communal" despite the label being visible from across the room.',
    state: 'open',
    redWeight: 19,
    greenWeight: 11,
  },
  {
    category: 'other',
    persona: 'judge_roast',
    title: 'My flatmate invited her boyfriend to move in without asking',
    body: 'Came home from a work trip to find his gaming setup in the living room and his clothes in the hall cupboard. She said she "was going to mention it". He has been here eleven days. We split rent two ways and there are now three people using one bathroom.',
    state: 'closing',
    redWeight: 76,
    greenWeight: 5,
  },
  {
    category: 'dating',
    persona: 'judge_calm',
    title: 'She remembered a detail I mentioned once in passing',
    body: 'I mentioned in week two that my grandmother used to make a specific dish that I have not had since she passed. Month four, she found the recipe, called her own grandmother for help, and made it for my birthday. She got it slightly wrong and I still cried at the table.',
    state: 'open',
    redWeight: 3,
    greenWeight: 64,
  },
];

async function main() {
  console.log('Seeding RedFlag.GG…\n');

  // Re-run guard: the project ships with 3 seeded cases, so only add more if the
  // docket is still close to empty.
  const { count } = await admin
    .from('cases')
    .select('id', { count: 'exact', head: true });

  if ((count ?? 0) > 6) {
    console.log(
      `Found ${count} cases already. Skipping to avoid flooding the docket.`
    );
    console.log('Delete them first if you want a fresh seed.');
    return;
  }

  /*
   * A seed author. `handle` and `avatar_seed` are NOT NULL, and the
   * `on_auth_user_created` trigger provisions them — but the account must also be
   * older than 10 minutes to satisfy `can_file_case()`, so the profile is
   * backdated below.
   */
  const email = `seed-${nanoid(6)}@redflag.local`;
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: nanoid(20),
  });

  if (userError || !created.user) {
    console.error('Could not create the seed author:', userError?.message);
    process.exit(1);
  }

  const authorId = created.user.id;
  console.log(`Seed author: ${email}`);

  await admin
    .from('profiles')
    .update({
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    } as never)
    .eq('id', authorId);

  let inserted = 0;

  for (const seed of CASES) {
    // `public_id` is omitted so the DB sequence assigns it.
    const { data: row, error } = await admin
      .from('cases')
      .insert({
        author_id: authorId,
        category: seed.category,
        title: seed.title,
        body: seed.body,
        judge_persona: seed.persona,
        status: seed.state === 'closed' ? 'closed' : 'live',
        language: 'en',
      })
      .select('id, public_id')
      .single();

    if (error || !row) {
      console.error(`  ✗ ${seed.title.slice(0, 40)}… — ${error?.message}`);
      continue;
    }

    /*
     * Tallies are normally trigger-maintained from real votes. Seeding writes
     * them directly so the bars look alive without fabricating vote rows that
     * would then need fake user ids.
     */
    const update: Record<string, unknown> = {
      red_weight: seed.redWeight ?? 0,
      green_weight: seed.greenWeight ?? 0,
      red_votes: Math.round((seed.redWeight ?? 0) / 2),
      green_votes: Math.round((seed.greenWeight ?? 0) / 2),
    };

    if (seed.state === 'closed' && seed.verdict) {
      update.ai_verdict = seed.verdict.verdict;
      update.ai_verdict_line = seed.verdict.headline;
      update.ai_roast = seed.verdict.roast;
      update.ai_summary = seed.verdict.summary;
      update.toxicity_score = seed.verdict.toxicity;
      update.is_split_verdict = seed.verdict.verdict === 'split';
      update.judge_model = 'seed';
      update.closed_at = new Date().toISOString();
    } else if (seed.state === 'closing') {
      // Backdate past the 12h window so the next cron sweep picks it up.
      update.created_at = new Date(
        Date.now() - 13 * 60 * 60 * 1000
      ).toISOString();
    }

    await admin
      .from('cases')
      .update(update as never)
      .eq('id', row.id);

    inserted += 1;
    const label =
      seed.state === 'closed'
        ? 'closed '
        : seed.state === 'closing'
          ? 'due    '
          : 'open   ';
    console.log(`  ✓ [${label}] ${row.public_id}  ${seed.title.slice(0, 46)}`);
  }

  console.log(`\nSeeded ${inserted}/${CASES.length} cases.`);
  console.log('Visit http://localhost:3000 to see the docket.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

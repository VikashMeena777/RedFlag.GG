import { ImageResponse } from 'next/og';
import { createServiceClient } from '@/lib/supabase/service';
import { verdictSchema } from '@/lib/ai/verdict-schema';
import {
  VerdictCard,
  loadCardFonts,
  cardFontConfig,
} from '@/lib/og/verdict-card';
import type { CaseCategory } from '@/lib/types';

/**
 * Link-unfurl card for a case.
 *
 * This is the growth loop: pasting a case link into WhatsApp, iMessage or X
 * renders the full verdict inline, so the drama travels without anyone needing
 * to click. Statically cached per case once the verdict exists.
 */

export const alt = 'RedFlag.GG verdict';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Next.js 16: params is a Promise (see upgrading/version-16.md).
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Service client: this route is public and must render even for crawlers with
  // no session, but it only ever exposes an already-public closed verdict.
  const admin = createServiceClient();
  const { data } = await admin
    .from('cases')
    .select(
      'case_no, category, title, verdict, red_votes, green_votes, red_weight, green_weight, status, is_hidden'
    )
    .eq('slug', slug)
    .maybeSingle();

  const fonts = await loadCardFonts();

  const parsedVerdict =
    data?.verdict != null ? verdictSchema.safeParse(data.verdict) : null;

  // No verdict yet, hidden, or removed → generic in-session card. Never leak the
  // body of a hidden case through the image renderer.
  if (
    !data ||
    data.is_hidden ||
    data.status !== 'closed' ||
    !parsedVerdict?.success
  ) {
    return new ImageResponse(<PendingCard />, {
      ...size,
      fonts: cardFontConfig(fonts),
    });
  }

  return new ImageResponse(
    (
      <VerdictCard
        variant="og"
        data={{
          caseNo: data.case_no,
          category: data.category as CaseCategory,
          title: data.title,
          verdict: parsedVerdict.data,
          redVotes: data.red_votes,
          greenVotes: data.green_votes,
          redWeight: data.red_weight,
          greenWeight: data.green_weight,
        }}
      />
    ),
    { ...size, fonts: cardFontConfig(fonts) }
  );
}

/** Shown while a case is still with the jury. */
function PendingCard() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F4EFE6',
        padding: 64,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 26,
          left: 26,
          right: 26,
          bottom: 26,
          border: '6px solid #12100E',
          display: 'flex',
        }}
      />
      <div
        style={{
          display: 'flex',
          fontFamily: 'SpaceMono',
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: 5,
          color: '#6E665A',
          marginBottom: 18,
        }}
      >
        NOW IN SESSION
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: 'Anton',
          fontSize: 104,
          letterSpacing: -2,
          color: '#12100E',
          marginBottom: 20,
        }}
      >
        REDFLAG.GG
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: 'Inter',
          fontSize: 30,
          color: '#12100E',
        }}
      >
        The jury is still voting. Cast yours.
      </div>
    </div>
  );
}

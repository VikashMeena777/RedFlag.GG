import { ImageResponse } from 'next/og';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verdictSchema } from '@/lib/ai/verdict-schema';
import { checkLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/auth/fingerprint';
import {
  VerdictCard,
  loadCardFonts,
  cardFontConfig,
} from '@/lib/og/verdict-card';
import type { CaseCategory } from '@/lib/types';

/**
 * Story-ready verdict card, 1080x1350 (4:5).
 *
 * Downloaded by the share button for pasting into an Instagram or WhatsApp
 * story. Same layout module as the OG unfurl, different frame.
 *
 * Only renders closed, unhidden cases. A pending or moderated case returns 404
 * rather than an image, so this route can never become a way to read a hidden
 * case body.
 */

export const size = { width: 1080, height: 1350 };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const ip = clientIp(await headers());
  const limit = await checkLimit('card:download', ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many downloads. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  const admin = createServiceClient();
  const { data } = await admin
    .from('cases')
    .select(
      'case_no, category, title, verdict, red_votes, green_votes, red_weight, green_weight, status, is_hidden'
    )
    .eq('slug', slug)
    .eq('status', 'closed')
    .eq('is_hidden', false)
    .maybeSingle();

  if (!data?.verdict) {
    return NextResponse.json(
      { error: 'No verdict card available for this case yet.' },
      { status: 404 }
    );
  }

  const parsed = verdictSchema.safeParse(data.verdict);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Verdict unavailable.' }, { status: 404 });
  }

  const fonts = await loadCardFonts();

  const image = new ImageResponse(
    (
      <VerdictCard
        variant="story"
        data={{
          caseNo: data.case_no,
          category: data.category as CaseCategory,
          title: data.title,
          verdict: parsed.data,
          redVotes: data.red_votes,
          greenVotes: data.green_votes,
          redWeight: data.red_weight,
          greenWeight: data.green_weight,
        }}
      />
    ),
    { ...size, fonts: cardFontConfig(fonts) }
  );

  // A closed verdict never changes, so it is safe to cache hard at the edge.
  const response = new NextResponse(image.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': `attachment; filename="redflag-${slug}.png"`,
    },
  });
  return response;
}

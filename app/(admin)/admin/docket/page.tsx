import type { Metadata } from 'next';
import { getViewer } from '@/lib/auth/viewer';
import { getReviewQueue } from '@/lib/actions/admin';
import { ReviewQueue } from '@/components/admin/review-queue';
import { BrutCard } from '@/components/ui/brut';

export const metadata: Metadata = {
  title: 'Moderation queue',
  robots: { index: false, follow: false },
};

/**
 * Admin review queue.
 *
 * Gated on the server-side ADMIN_USER_IDS allowlist. A non-admin gets the same
 * generic "not found" treatment rather than a 403, so the route's existence is
 * not confirmed to people probing for it.
 */
export default async function AdminDocketPage() {
  const viewer = await getViewer();

  if (!viewer.isAdmin) {
    return (
      <div className="court-container py-16">
        <BrutCard className="p-8 text-center">
          <h1 className="text-2xl text-ink">Nothing here</h1>
          <p className="mt-2 text-sm text-ink-soft">
            This page does not exist for your account.
          </p>
        </BrutCard>
      </div>
    );
  }

  const queue = await getReviewQueue(50);

  return (
    <div className="court-container-wide py-8">
      <p className="docket-label">Clerk&rsquo;s desk</p>
      <h1 className="mt-2 text-[clamp(2rem,8vw,3rem)] leading-[0.92] text-ink">
        MODERATION QUEUE
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-soft">
        Cases that were reported, auto-hidden, or flagged for language. Removing a
        case strikes its author; three strikes ends their filing rights.
      </p>

      <div className="mt-8">
        <ReviewQueue cases={queue} />
      </div>
    </div>
  );
}

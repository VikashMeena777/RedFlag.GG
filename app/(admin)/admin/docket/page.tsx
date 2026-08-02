import type { Metadata } from 'next';
import { getViewer } from '@/lib/auth/viewer';
import { getReviewQueue } from '@/lib/actions/admin';
import { ReviewQueue } from '@/components/admin/review-queue';
import { Panel } from '@/components/ui/neon';

export const metadata: Metadata = {
  title: 'Moderation queue',
  robots: { index: false, follow: false },
};

/**
 * Admin review queue.
 *
 * Gated on `profiles.is_admin`. A non-admin gets a generic "nothing here" rather
 * than a 403, so the route's existence is not confirmed to people probing for it.
 */
export default async function AdminDocketPage() {
  const viewer = await getViewer();

  if (!viewer.isAdmin) {
    return (
      <div className="court-container py-16">
        <Panel className="p-9 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Nothing here
          </h1>
          <p className="mt-2.5 text-sm text-ink-muted">
            This page does not exist for your account.
          </p>
        </Panel>
      </div>
    );
  }

  const queue = await getReviewQueue(50);

  return (
    <div className="court-container-wide py-10">
      <p className="hud">Clerk&rsquo;s desk</p>
      <h1 className="mt-3 font-display text-[clamp(2rem,8vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-ink">
        Moderation queue
      </h1>
      <p className="mt-4 max-w-lg font-read text-sm leading-relaxed text-ink-muted">
        Cases that were reported, auto-hidden, or flagged for language. Removing a
        case strikes its author; three strikes ends their filing rights.
      </p>

      <div className="mt-9">
        <ReviewQueue cases={queue} />
      </div>
    </div>
  );
}

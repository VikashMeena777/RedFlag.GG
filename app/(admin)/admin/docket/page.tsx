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
          <h1 className="font-display text-2xl font-bold tracking-[-0.04em] text-chalk">
            Nothing here
          </h1>
          <p className="mt-2.5 text-sm text-chalk-dim">
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
      <h1 className="mt-3 font-display text-[clamp(2rem,8vw,3rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
        <span className="chrome">Moderation queue</span>
      </h1>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-chalk-dim">
        Cases that were reported, auto-hidden, or flagged for language. Removing a
        case strikes its author; three strikes ends their filing rights.
      </p>

      <div className="mt-9">
        <ReviewQueue cases={queue} />
      </div>
    </div>
  );
}

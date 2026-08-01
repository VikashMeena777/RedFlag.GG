import { DocketSkeleton, HeadingSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="court-container py-8 sm:py-12">
      <HeadingSkeleton />
      <div className="mt-10">
        <DocketSkeleton count={4} />
      </div>
    </div>
  );
}

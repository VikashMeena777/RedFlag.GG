import { CaseSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="court-container py-8">
      <CaseSkeleton />
    </div>
  );
}

import { CourtHeader, CourtFooter } from '@/components/court/chrome';

/**
 * Court shell. Renders the standard chrome around court pages.
 */
export default function CourtLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CourtHeader />
      <main className="min-h-[60vh]">{children}</main>
      <CourtFooter />
    </>
  );
}

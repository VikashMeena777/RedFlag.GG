import { JurorProvider } from '@/components/providers/juror-provider';
import { CourtHeader, CourtFooter } from '@/components/court/chrome';

/**
 * Court shell. Seats every visitor as a juror (anonymous session) so voting
 * works with no signup wall, then renders the standard chrome.
 */
export default function CourtLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JurorProvider />
      <CourtHeader />
      <main className="min-h-[60vh]">{children}</main>
      <CourtFooter />
    </>
  );
}

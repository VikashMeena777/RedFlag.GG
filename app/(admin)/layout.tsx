import { JurorProvider } from '@/components/providers/juror-provider';
import { CourtHeader, CourtFooter } from '@/components/court/chrome';

export default function AdminLayout({
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

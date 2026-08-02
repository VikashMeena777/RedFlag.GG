import { CourtHeader, CourtFooter } from '@/components/court/chrome';

export default function AccountLayout({
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

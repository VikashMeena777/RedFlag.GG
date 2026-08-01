import type { Metadata, Viewport } from 'next';
import {
  Bricolage_Grotesque,
  Azeret_Mono,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

/*
 * Three faces, three jobs:
 *  - Bricolage Grotesque — display. Variable, wide, a little unhinged. Used in
 *    MIXED CASE, which is the point: the sibling newsprint project owns
 *    condensed all-caps display type, so this must not go near it.
 *  - Azeret Mono — HUD voice for case numbers, timers, counts. Squarer and more
 *    technical than Space Mono.
 *  - Plus Jakarta Sans — body. Rounder terminals than Inter, reads friendlier on
 *    a dark background.
 *
 * The .ttf files in `assets/` are what Satori uses for share cards; next/font is
 * unavailable to the image renderer, so the two sets must stay in sync.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-bricolage',
  display: 'swap',
});

const azeretMono = Azeret_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-azeret',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'RedFlag.GG — The Internet Court of Red Flags',
    template: '%s · RedFlag.GG',
  },
  description:
    'File your dating drama. The jury votes red flag or green flag. The AI judge delivers the verdict and the roast.',
  applicationName: 'RedFlag.GG',
  openGraph: {
    type: 'website',
    siteName: 'RedFlag.GG',
    title: 'RedFlag.GG — The Internet Court of Red Flags',
    description:
      'File your dating drama. The jury votes. The AI judge roasts. Court is in session.',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RedFlag.GG — The Internet Court of Red Flags',
    description:
      'File your dating drama. The jury votes. The AI judge roasts. Court is in session.',
  },
  /*
   * Deliberately no `robots` here.
   *
   * Next.js injects `noindex` on 404 responses, but a root-layout `index, follow`
   * is emitted *after* it, producing contradictory tags on not-found pages. The
   * default is already indexable, and `app/robots.ts` states the crawl policy, so
   * declaring it again buys nothing and breaks the 404 case.
   */
};

export const viewport: Viewport = {
  themeColor: '#07060C',
  width: 'device-width',
  initialScale: 1,
  // Dark-first: keeps the browser chrome from flashing white on load.
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${azeretMono.variable} ${jakarta.variable}`}
    >
      <body className="antialiased">
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: 'rgba(26, 23, 40, 0.92)',
              color: '#F5F2FF',
              border: '1px solid #423A63',
              borderRadius: '14px',
              boxShadow: '0 12px 40px -8px rgba(0, 0, 0, 0.9)',
              backdropFilter: 'blur(16px)',
              fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
              fontWeight: 500,
            },
          }}
        />
      </body>
    </html>
  );
}

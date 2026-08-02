import type { Metadata, Viewport } from 'next';
import { Fraunces, Newsreader, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

/*
 * Three faces, three jobs:
 *  - Fraunces — display. A high-contrast serif with optical-size and "soft"
 *    axes, used in SENTENCE CASE. The whole look rests on this: it is what makes
 *    the page read as an editorial feature rather than as an interface, and it is
 *    the clearest break from the all-caps display faces used in earlier attempts.
 *  - Newsreader — long-form case bodies. A reading serif, not a UI face; it makes
 *    a 900-character story feel like an article instead of a form field.
 *  - Inter — UI furniture: labels, buttons, metadata, and anything numeric.
 *
 * The font files in `assets/` are what Satori uses for share cards; next/font is
 * unavailable to the image renderer, so the two sets must stay in sync.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  // Variable weight, not a static list: `axes` and an explicit `weight` are
  // mutually exclusive in next/font, and we need the axes to tame Fraunces'
  // default wonk.
  weight: 'variable',
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
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
  // Matches --color-page so mobile browser chrome blends into the paper.
  themeColor: '#FBFAF7',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${newsreader.variable} ${inter.variable}`}
    >
      <body className="antialiased">
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#FFFFFF',
              color: '#17161A',
              border: '1px solid #CDC7BA',
              borderRadius: '4px',
              boxShadow: '0 6px 24px -8px rgba(23, 22, 26, 0.18)',
              fontFamily: 'var(--font-inter), system-ui, sans-serif',
              fontWeight: 500,
            },
          }}
        />
      </body>
    </html>
  );
}

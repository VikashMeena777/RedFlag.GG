import type { Metadata, Viewport } from 'next';
import { Anton, Space_Mono, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

/*
 * Three faces, three jobs. Anton for authority, Space Mono for docket chrome,
 * Inter for readable body copy. Each is exposed as a CSS variable consumed by
 * the `@theme` font tokens in globals.css.
 *
 * The matching .ttf files in `assets/` are what Satori uses for OG cards —
 * next/font cannot be read by the image renderer, so the two must stay in sync.
 */
const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-anton',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
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
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#F4EFE6',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${spaceMono.variable} ${inter.variable}`}
    >
      <body className="antialiased">
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#F4EFE6',
              color: '#12100E',
              border: '3px solid #12100E',
              borderRadius: 0,
              boxShadow: '6px 6px 0 0 #12100E',
              fontFamily: 'var(--font-inter), system-ui, sans-serif',
              fontWeight: 500,
            },
          }}
        />
      </body>
    </html>
  );
}

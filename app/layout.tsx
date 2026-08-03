import type { Metadata, Viewport } from 'next';
import { Fraunces, Newsreader, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/providers/theme-provider';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
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
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFAF7' },
    { media: '(prefers-color-scheme: dark)', color: '#0D0C10' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${newsreader.variable} ${inter.variable}`}
    >
      <body className="antialiased bg-page text-ink selection:bg-verdict-red selection:text-white transition-colors duration-200">
        <ThemeProvider>
          {children}
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                background: 'var(--color-surface)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-rule-strong)',
                borderRadius: '4px',
                fontFamily: 'var(--font-inter), system-ui, sans-serif',
                fontWeight: 500,
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

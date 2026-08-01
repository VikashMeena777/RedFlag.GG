import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config.
 *
 * These specs exercise the parts of the court that work without live
 * credentials: rendering, navigation, the design system, accessibility, and the
 * verified-only gates. Anything requiring a real Supabase session, a Groq
 * completion, or a Cashfree mandate is out of scope here — those need staging
 * credentials and are documented in docs/SETUP.md.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html']] : [['list']],

  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The court is a phone-first product; a 390px viewport is the real
      // default, not an edge case.
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
    },
  ],

  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

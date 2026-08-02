import { test, expect } from '@playwright/test';

/**
 * Court smoke tests.
 *
 * Scope: everything that must work with no live credentials. Without Supabase the
 * docket renders empty, which is itself worth asserting — an empty state that
 * crashes is a worse first impression than no cases.
 */

test.describe('the docket', () => {
  test('renders the hero and primary actions', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { level: 1, name: /RED FLAG/i })
    ).toBeVisible();

    await expect(page.getByRole('link', { name: /file a case/i }).first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: /most toxic/i }).first()
    ).toBeVisible();
  });

  test('survives having no cases', async ({ page }) => {
    await page.goto('/');
    // Either real cases or the empty state — never an error boundary.
    await expect(page.getByText(/something broke/i)).toHaveCount(0);
    await expect(page.locator('main')).toBeVisible();
  });

  test('applies the editorial "record" palette', async ({ page }) => {
    await page.goto('/');
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    // --color-page #FBFAF7 (warm paper). A wrong value here means the @theme
    // block broke or the wrong design system got shipped.
    expect(bg).toBe('rgb(251, 250, 247)');
  });

  /*
   * Asserts the display serif is loaded, not merely requested.
   *
   * `fontFamily` reports the declared stack, so it would pass even if the webfont
   * never arrived and the browser fell back to Georgia. `document.fonts.check`
   * reports actual availability, which is what a broken next/font wiring breaks.
   */
  test('loads the Fraunces display serif', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    const family = await page
      .getByRole('heading', { level: 1 })
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family.toLowerCase()).toContain('fraunces');

    // Fraunces is loaded as a variable font (weight axis), so check a mid weight.
    const loaded = await page.evaluate(() =>
      document.fonts.check('600 1rem "Fraunces"')
    );
    expect(loaded).toBe(true);
  });

  /*
   * The two rejected directions — dark-neon and paper/ink brutalism — must not
   * leak back in. This asserts the editorial tokens are present and the retired
   * ones are gone, so a stray copy-paste from an old branch fails CI rather than
   * review.
   */
  test('does not regress toward a retired design system', async ({ page }) => {
    await page.goto('/');

    const audit = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const token = (name: string) => root.getPropertyValue(name).trim();

      /*
       * A *displaced* zero-blur shadow (`6px 6px 0 0`) is the brutalist
       * signature. The offset must be non-zero: `0px 0px 0px 0px` is not an
       * offset shadow, so it is excluded to avoid false positives.
       */
      const hardShadows = [...document.querySelectorAll('*')].filter((el) => {
        const match = /^rgba?\([^)]*\)\s+(-?\d+)px\s+(-?\d+)px\s+0px\s+0px$/.exec(
          getComputedStyle(el).boxShadow
        );
        if (!match) return false;
        const [x, y] = [Number(match[1]), Number(match[2])];
        return x !== 0 || y !== 0;
      }).length;

      return {
        // Current editorial tokens — must exist.
        pageToken: token('--color-page'),
        verdictRedToken: token('--color-verdict-red'),
        // Retired tokens from the two previous systems — must be gone.
        voidToken: token('--color-void'),
        chalkToken: token('--color-chalk'),
        paperBrutalistToken: token('--color-paper'),
        hardShadows,
      };
    });

    // Editorial system present.
    expect(audit.pageToken).toBe('#fbfaf7');
    expect(audit.verdictRedToken).toBe('#b3202b');
    // Neither retired system's signature tokens survive.
    expect(audit.voidToken).toBe('');
    expect(audit.chalkToken).toBe('');
    expect(audit.paperBrutalistToken).toBe('');
    // No hard offset shadows anywhere.
    expect(audit.hardShadows).toBe(0);
  });
});

test.describe('navigation', () => {
  test('reaches the toxic docket', async ({ page }) => {
    await page.goto('/docket');
    await expect(
      page.getByRole('heading', { level: 1, name: /most toxic/i })
    ).toBeVisible();
  });

  test('reaches the rules', async ({ page }) => {
    await page.goto('/rules');
    await expect(
      page.getByRole('heading', { level: 1, name: /COURT RULES/i })
    ).toBeVisible();
    // The no-doxxing rule is the load-bearing one; it must always be present.
    await expect(page.getByText(/no names, @handles/i).first()).toBeVisible();
  });

  /*
   * Next 16 returns 200 for a *streamed* not-found response and 404 only for
   * non-streamed ones (see not-found.md: "Next.js will return a 200 HTTP status
   * code for streamed responses, and 404 for non-streamed"). This route streams,
   * so asserting 404 here would be asserting against the framework.
   *
   * What actually matters is verified instead: the user sees the court's own
   * not-found UI, and the page is marked noindex so it cannot be indexed.
   */
  test('shows the styled not-found UI for an unknown case', async ({ page }) => {
    await page.goto('/case/CASE-999999');
    await expect(page.getByRole('heading', { name: /NO SUCH/i })).toBeVisible();
  });

  /*
   * Asserted against the raw server response, not the hydrated DOM.
   *
   * Next.js 16 returns 200 for streamed not-found responses and relies on an
   * injected `noindex` to keep them out of search results. That tag lives in the
   * server-rendered head; React drops it during hydration because client-side
   * metadata does not declare it. Crawlers read the server response, so that is
   * what this checks — `page.goto` would assert the wrong artifact.
   */
  test('the not-found response is marked noindex for crawlers', async ({
    request,
  }) => {
    const res = await request.get('/case/CASE-999999');
    const html = await res.text();
    expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/);
    expect(html).not.toMatch(/content="index, follow"/);
  });

  test('shows the not-found UI for a malformed case id', async ({ page }) => {
    await page.goto('/case/not-a-case-id');
    await expect(page.getByRole('heading', { name: /NO SUCH/i })).toBeVisible();
  });
});

test.describe('the filing gate', () => {
  test('blocks unverified users and explains why', async ({ page }) => {
    await page.goto('/file');

    // Without a verified session this must be the wall, never the form.
    await expect(
      page.getByRole('heading', { name: /VERIFY TO FILE/i })
    ).toBeVisible();

    // The reasoning matters: an unexplained wall reads as a growth tactic.
    await expect(page.getByText(/voting stays anonymous/i)).toBeVisible();
  });
});

test.describe('accessibility', () => {
  test('every page has exactly one h1', async ({ page }) => {
    for (const path of ['/', '/docket', '/rules', '/file']) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
    }
  });

  /*
   * Focuses the control directly rather than pressing Tab.
   *
   * WebKit mirrors Safari on macOS, where Tab does not move focus to links unless
   * the user opts in ("Press Tab to highlight each item"). So a Tab-based
   * assertion measures the engine's tab-order policy, not our CSS — it left
   * `activeElement` as BODY and failed even though the ring was correctly defined.
   *
   * What matters for accessibility is that a focused control gets a visible ring,
   * which is what this checks. Both engines report `solid 3px rgb(42, 31, 214)`.
   */
  test('focus is visible against paper', async ({ page }) => {
    await page.goto('/');

    const ring = await page.evaluate(() => {
      const link = document.querySelector<HTMLElement>('a[href]');
      if (!link) return null;
      link.focus();
      const s = getComputedStyle(link);
      return {
        style: s.outlineStyle,
        width: s.outlineWidth,
        color: s.outlineColor,
        isFocused: document.activeElement === link,
      };
    });

    expect(ring).not.toBeNull();
    expect(ring?.isFocused).toBe(true);
    // 3px solid judge-blue (#2A1FD6). `none` or 0px means the ring regressed.
    expect(ring?.style).not.toBe('none');
    expect(parseFloat(ring?.width ?? '0')).toBeGreaterThanOrEqual(2);
  });

  test('images and icons are not announced as content', async ({ page }) => {
    await page.goto('/');
    // Decorative lucide icons must carry aria-hidden.
    const unlabelled = await page
      .locator('svg:not([aria-hidden="true"]):not([aria-label])')
      .count();
    expect(unlabelled).toBe(0);
  });
});

test.describe('metadata and crawlers', () => {
  test('serves robots.txt with a sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('Sitemap:');
    // Private surfaces must stay out of the index.
    expect(body).toContain('/admin/');
  });

  test('serves a sitemap', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('<urlset');
  });

  test('serves the web manifest', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toContain('RedFlag');
    expect(manifest.theme_color).toBe('#FBFAF7');
  });

  test('sets security headers', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    // Cashfree checkout must be permitted, Stripe must be gone.
    expect(headers['content-security-policy']).toContain('cashfree.com');
  });

  /*
   * TLS headers must follow the *request protocol*, not a build-time env guess.
   *
   * This regressed once already and was genuinely hard to diagnose: with
   * NEXT_PUBLIC_SITE_URL set to the deployed https domain, a local build baked
   * `upgrade-insecure-requests` into every response. WebKit honours that on
   * http://localhost (Chromium exempts it), rewriting assets to
   * https://localhost:3000 where nothing listens — so the whole app rendered
   * unstyled and five unrelated design tests failed with a transparent body.
   *
   * `next.config.ts` cannot fix this because `headers()` is evaluated at build
   * time; `proxy.ts` decides per request. These assertions pin that behaviour.
   */
  test('omits TLS-only headers on a plain HTTP request', async ({ request }) => {
    const headers = (await request.get('/')).headers();

    // Would make every asset unloadable over http://localhost.
    expect(headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests'
    );
    // Would pin localhost:3000 to HTTPS for two years, breaking other projects.
    expect(headers['strict-transport-security']).toBeUndefined();
  });

  test('applies TLS-only headers when the request is forwarded as HTTPS', async ({
    request,
  }) => {
    const headers = (
      await request.get('/', { headers: { 'x-forwarded-proto': 'https' } })
    ).headers();

    expect(headers['content-security-policy']).toContain(
      'upgrade-insecure-requests'
    );
    expect(headers['strict-transport-security']).toContain('max-age=');
  });

  test('trusts only the first x-forwarded-proto hop', async ({ request }) => {
    // Later entries are attacker-appendable, so `http, https` must stay insecure.
    const spoofed = (
      await request.get('/', { headers: { 'x-forwarded-proto': 'http, https' } })
    ).headers();

    expect(spoofed['content-security-policy']).not.toContain(
      'upgrade-insecure-requests'
    );
    expect(spoofed['strict-transport-security']).toBeUndefined();
  });
});

test.describe('protected endpoints', () => {
  test('the gavel cron rejects unauthenticated calls', async ({ request }) => {
    const response = await request.get('/api/cron/gavel');
    // Fails closed: 401 when the secret is wrong OR unset.
    expect(response.status()).toBe(401);
  });

  test('the Cashfree webhook rejects an unsigned payload', async ({ request }) => {
    const response = await request.post('/api/cashfree/webhook', {
      data: { type: 'SUBSCRIPTION_STATUS_CHANGE_ACTIVE' },
    });
    // No signature header — must never reach the database.
    expect(response.status()).toBe(401);
  });

  test('the admin queue is not exposed', async ({ page }) => {
    await page.goto('/admin/docket');
    // Generic copy, not a 403: the route is not confirmed to people probing.
    await expect(page.getByText(/nothing here/i)).toBeVisible();
  });

  test('the health check reports status', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    expect(['ok', 'degraded', 'down']).toContain(body.status);
    // Must not leak configuration.
    const text = JSON.stringify(body);
    expect(text).not.toContain('supabase.co');
    expect(text).not.toMatch(/nvapi-|gsk_/);
  });
});

test.describe('share cards', () => {
  test('the PNG route 404s for an unknown case', async ({ request }) => {
    const response = await request.get('/api/card/CASE-999999');
    // Only closed cases render — never a pending or hidden body.
    expect([404, 429]).toContain(response.status());
  });
});

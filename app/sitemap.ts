import type { MetadataRoute } from 'next';
import { getClosedCaseIds } from '@/lib/actions/cases';
import { serverEnv } from '@/lib/env';

/**
 * Sitemap. Closed cases only — an open case has no verdict yet, so indexing it
 * would surface a page whose main content is about to change.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = serverEnv.siteUrl;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/docket`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/file`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/rules`, changeFrequency: 'monthly', priority: 0.4 },
  ];

  let caseRoutes: MetadataRoute.Sitemap = [];
  try {
    const caseIds = await getClosedCaseIds(500);
    caseRoutes = caseIds.map((caseId) => ({
      url: `${base}/case/${caseId}`,
      changeFrequency: 'never' as const,
      priority: 0.6,
    }));
  } catch (error) {
    // A sitemap is not worth failing a build over.
    console.error('[sitemap] could not list cases:', error);
  }

  return [...staticRoutes, ...caseRoutes];
}

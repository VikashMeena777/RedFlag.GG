import type { MetadataRoute } from 'next';
import { serverEnv } from '@/lib/env';

/**
 * Robots.
 *
 * The share-card and API routes are disallowed: crawlers should index the case
 * page (which carries the OG tags), not the raw PNG endpoint. `opengraph-image`
 * stays crawlable because social unfurlers fetch it directly.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/', '/admin/', '/account'],
      },
    ],
    sitemap: `${serverEnv.siteUrl}/sitemap.xml`,
  };
}

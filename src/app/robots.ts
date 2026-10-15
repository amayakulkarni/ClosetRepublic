import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

// Served at /robots.txt. Everything public may be crawled; the admin page and the API may not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/discord/login', '/discord/callback'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

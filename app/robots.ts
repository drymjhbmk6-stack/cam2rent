import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/konto/', '/api/', '/checkout/', '/warenkorb/', '/auth/'],
    },
    sitemap: 'https://cam2rent.de/sitemap.xml',
  };
}

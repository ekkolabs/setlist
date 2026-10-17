import type { MetadataRoute } from 'next';
import { siteConfig } from '@/site.config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
    theme_color: '#111111',
    background_color: '#ffffff',
    display: 'standalone',
  };
}

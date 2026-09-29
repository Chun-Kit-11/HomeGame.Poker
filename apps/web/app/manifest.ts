import type { MetadataRoute } from 'next';

/** Lets phones install the site as a full-screen app ("Add to Home Screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Home Game · Private Poker',
    short_name: 'Home Game',
    description: "Private No-Limit Hold'em with friends",
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#030303',
    theme_color: '#030303',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

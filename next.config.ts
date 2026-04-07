import type { NextConfig } from 'next';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : '';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      // Supabase Storage Bilder
      ...(supabaseHostname ? [{
        protocol: 'https' as const,
        hostname: supabaseHostname,
        pathname: '/storage/v1/object/public/**',
      }] : []),
      // Lokale Bilder (Fallback)
      {
        protocol: 'https' as const,
        hostname: 'test.cam2rent.de',
      },
      {
        protocol: 'https' as const,
        hostname: 'cam2rent.de',
      },
    ],
  },
};

export default nextConfig;

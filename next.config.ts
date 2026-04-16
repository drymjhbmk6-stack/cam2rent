import type { NextConfig } from 'next';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : '';

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  // Große Pakete automatisch tree-shaken
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', 'date-fns', 'lucide-react'],
  },
  // Unnötige Dateien vom Output-Tracing ausschließen (spart RAM beim Build)
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@swc/core-linux-x64-gnu',
      'node_modules/@swc/core-linux-x64-musl',
      'node_modules/@swc/core-linux-arm64-gnu',
      'node_modules/@swc/core-linux-arm64-musl',
      'node_modules/@esbuild',
      'node_modules/typescript',
      'node_modules/prettier',
      'node_modules/eslint',
      'node_modules/@next/swc-linux-x64-gnu',
      'node_modules/@next/swc-linux-x64-musl',
      'node_modules/sharp',
      'node_modules/@img',
    ],
  },
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
      // Unsplash Bilder (Blog-Vorschau)
      {
        protocol: 'https' as const,
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // ESLint und TypeScript beim Build skippen (spart RAM auf dem Server)
  // Wird lokal vor dem Push geprüft
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

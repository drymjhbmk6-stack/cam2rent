import type { Metadata } from 'next';
import { Sora, DM_Sans } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { CartProvider } from '@/components/CartProvider';
import { FavoritesProvider } from '@/components/FavoritesProvider';
import PageTracker from '@/components/PageTracker';
import ShopShell from '@/components/ShopShell';
import CookieBanner from '@/components/CookieBanner';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import InstallPrompt from '@/components/InstallPrompt';
import { Suspense } from 'react';

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://cam2rent.de'),
  title: {
    default: 'Cam2Rent – Action-Cams mieten statt kaufen',
    template: '%s – Cam2Rent',
  },
  description:
    'Hochwertige Action-Kameras von GoPro, DJI und Insta360 mieten. Ab 9,90 €/Tag. Mit Haftungsschutz, kostenloser Versand, 24h Lieferung.',
  keywords: 'Action Cam mieten, GoPro mieten, DJI mieten, Insta360 mieten, Kamera mieten',
  openGraph: {
    title: 'Cam2Rent – Action-Cams mieten statt kaufen',
    description: 'Hochwertige Action-Kameras von GoPro, DJI und Insta360 mieten. Ab 9,90 €/Tag.',
    url: 'https://cam2rent.de',
    siteName: 'Cam2Rent',
    locale: 'de_DE',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cam2Rent – Action-Cams mieten statt kaufen',
    description: 'Hochwertige Action-Kameras von GoPro, DJI und Insta360 mieten. Ab 9,90 €/Tag.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${sora.variable} ${dmSans.variable}`}>
      <body className="font-body antialiased">
        <AuthProvider>
          <FavoritesProvider>
            <CartProvider>
              <Suspense fallback={null}>
                <PageTracker />
              </Suspense>
              <ShopShell>{children}</ShopShell>
              <CookieBanner />
              <ServiceWorkerRegistration />
              <InstallPrompt />
            </CartProvider>
          </FavoritesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

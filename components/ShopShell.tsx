'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import WhatsAppButton from '@/components/WhatsAppButton';
import NewsBanner from '@/components/NewsBanner';
import CompareBar from '@/components/CompareBar';

export default function ShopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    // Admin-Bereich: kein Navbar, kein Footer, kein <main>-Wrapper
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <NewsBanner />
      <main>{children}</main>
      <Footer />
      <CompareBar />
      <WhatsAppButton />
    </>
  );
}

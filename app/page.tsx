import Hero from '@/components/home/Hero';
import ProductGrid from '@/components/home/ProductGrid';
import TrustBanner from '@/components/home/TrustBanner';
import HowItWorks from '@/components/home/HowItWorks';
import CtaBanner from '@/components/home/CtaBanner';

export default function Home() {
  return (
    <>
      <Hero />
      <ProductGrid />
      <TrustBanner />
      <HowItWorks />
      <CtaBanner />
    </>
  );
}

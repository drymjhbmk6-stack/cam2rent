import Hero from '@/components/home/Hero';
import ProductGrid from '@/components/home/ProductGrid';
import KameraFinderCta from '@/components/home/KameraFinderCta';
import TrustBanner from '@/components/home/TrustBanner';
import HowItWorks from '@/components/home/HowItWorks';
import CtaBanner from '@/components/home/CtaBanner';
import HomeReviews from '@/components/home/HomeReviews';
import GoogleReviews from '@/components/home/GoogleReviews';
import AppInstallBanner from '@/components/home/AppInstallBanner';
import UnderConstructionBanner from '@/components/home/UnderConstructionBanner';

export default function Home() {
  return (
    <>
      <UnderConstructionBanner />
      <Hero />
      <TrustBanner />
      <ProductGrid />
      <KameraFinderCta />
      <HowItWorks />
      <HomeReviews />
      <GoogleReviews />
      <AppInstallBanner />
      <CtaBanner />
    </>
  );
}

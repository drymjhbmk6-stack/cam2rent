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
import { getHomePageData } from '@/lib/get-homepage-data';

export default async function Home() {
  const data = await getHomePageData();

  return (
    <>
      {data.showConstructionBanner && <UnderConstructionBanner serverVisible />}
      <Hero serverData={data.hero} serverImage={data.seasonalImage} serverMonth={data.seasonalMonth} />
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

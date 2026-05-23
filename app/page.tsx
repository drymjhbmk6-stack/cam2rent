import Hero from '@/components/home/Hero';
import PromoBanner from '@/components/home/PromoBanner';
import HomeSeasonalAction from '@/components/home/HomeSeasonalAction';
import ProductGrid from '@/components/home/ProductGrid';
import HomeFresh from '@/components/home/HomeFresh';
import KameraFinderCta from '@/components/home/KameraFinderCta';
import TrustBanner from '@/components/home/TrustBanner';
import HowItWorks from '@/components/home/HowItWorks';
import CtaBanner from '@/components/home/CtaBanner';
import HomeUgc from '@/components/home/HomeUgc';
import GoogleReviews from '@/components/home/GoogleReviews';
import NewsletterSignup from '@/components/home/NewsletterSignup';
import AppInstallBanner from '@/components/home/AppInstallBanner';
import UnderConstructionBanner from '@/components/home/UnderConstructionBanner';
import CustomerPushPrompt from '@/components/home/CustomerPushPrompt';
import HomeSeoText from '@/components/home/HomeSeoText';
import { getHomePageData } from '@/lib/get-homepage-data';

// ISR-Cache: max. 60 Sek alt. Shop-Updater ruft revalidatePath('/') auf,
// damit Änderungen sofort sichtbar sind — der Cache ist nur Schutz vor
// DB-Last im Normalbetrieb.
export const revalidate = 60;

export default async function Home() {
  const data = await getHomePageData();

  return (
    <>
      {data.showConstructionBanner && <UnderConstructionBanner serverVisible />}
      <div className="relative overflow-x-hidden">
        <Hero serverData={data.hero} serverImage={data.seasonalImage} serverMonth={data.seasonalMonth} />
        <PromoBanner />
      </div>
      <HomeSeasonalAction />
      <TrustBanner />
      <ProductGrid />
      <HomeFresh />
      <KameraFinderCta />
      <HowItWorks />
      <HomeUgc />
      {/* GoogleReviews mischt seit 2026-05-23 Google-API + manuelle Google-
          Reviews + interne Reviews aus dem Umfrage-Flow in einer Section. */}
      <GoogleReviews />
      <NewsletterSignup />
      <AppInstallBanner />
      <HomeSeoText data={data.seoText} />
      <CtaBanner />
      <CustomerPushPrompt />
    </>
  );
}

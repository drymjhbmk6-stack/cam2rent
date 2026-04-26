import Hero from '@/components/home/Hero';
import HomeSeasonalAction from '@/components/home/HomeSeasonalAction';
import ProductGrid from '@/components/home/ProductGrid';
import HomeFresh from '@/components/home/HomeFresh';
import KameraFinderCta from '@/components/home/KameraFinderCta';
import TrustBanner from '@/components/home/TrustBanner';
import HowItWorks from '@/components/home/HowItWorks';
import CtaBanner from '@/components/home/CtaBanner';
import HomeReviews from '@/components/home/HomeReviews';
import GoogleReviews from '@/components/home/GoogleReviews';
import HomeUgc from '@/components/home/HomeUgc';
import NewsletterSignup from '@/components/home/NewsletterSignup';
import AppInstallBanner from '@/components/home/AppInstallBanner';
import UnderConstructionBanner from '@/components/home/UnderConstructionBanner';
import BetaFeedbackButton from '@/components/home/BetaFeedbackButton';
import CustomerPushPrompt from '@/components/home/CustomerPushPrompt';
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
      <Hero serverData={data.hero} serverImage={data.seasonalImage} serverMonth={data.seasonalMonth} />
      <HomeSeasonalAction />
      <TrustBanner />
      <ProductGrid />
      <HomeFresh />
      <KameraFinderCta />
      <HowItWorks />
      <HomeUgc />
      <HomeReviews />
      <GoogleReviews />
      <NewsletterSignup />
      <AppInstallBanner />
      <CtaBanner />
      <BetaFeedbackButton />
      <CustomerPushPrompt />
    </>
  );
}

import { loadReviews } from '@/lib/admin/load-reviews';
import BewertungenClient, { type Review } from './BewertungenClient';

// Immer per Request server-rendern; Zugriffskontrolle über die Middleware.
export const dynamic = 'force-dynamic';

export default async function AdminBewertungenPage() {
  // Default-Filter 'all' — passend zum Initial-State im Client.
  const { reviews } = await loadReviews('all');
  return <BewertungenClient initialReviews={reviews as unknown as Review[]} />;
}

import { loadAlleBuchungen } from '@/lib/admin/load-alle-buchungen';
import BuchungenClient, { type Booking } from './BuchungenClient';

// Immer per Request server-rendern (nie beim Build — im Cloud-Build gibt es
// keine DB). Die Zugriffskontrolle macht die Middleware (Prefix /admin →
// Permission tagesgeschaeft), analog zur API-Route.
export const dynamic = 'force-dynamic';

/**
 * Server-gerenderte Buchungsliste: die Buchungen kommen bereits im ersten
 * HTML mit (kein leerer Spinner mehr). Interaktivität + Filter + Aktionen
 * laufen in <BuchungenClient>. Fällt der SSR-Load aus (DB-Blip), liefert er
 * eine leere Liste und der Client lädt einmalig nach.
 */
export default async function AdminBuchungenPage() {
  const { bookings } = await loadAlleBuchungen({ limit: 500 });
  return <BuchungenClient initialBookings={bookings as unknown as Booking[]} />;
}

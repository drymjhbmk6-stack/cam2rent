import { loadWaitlist } from '@/lib/admin/load-waitlist';
import WartelisteClient, { type WaitlistEntry } from './WartelisteClient';

// Immer per Request server-rendern (nie beim Build — keine DB im Cloud-Build).
// Zugriffskontrolle über die Middleware (Prefix /admin).
export const dynamic = 'force-dynamic';

export default async function WartelistePage() {
  const { entries } = await loadWaitlist();
  return <WartelisteClient initialEntries={entries as unknown as WaitlistEntry[]} />;
}

import { loadSales } from '@/lib/admin/load-sales';
import VerkaufClient, { type Sale } from './VerkaufClient';

// Immer per Request server-rendern; Zugriffskontrolle über die Middleware.
export const dynamic = 'force-dynamic';

export default async function VerkaufPage() {
  const { sales } = await loadSales();
  return <VerkaufClient initialSales={sales as unknown as Sale[]} />;
}

import { loadDamageReports } from '@/lib/admin/load-damage-reports';
import SchaedenClient, { type DamageReport } from './SchaedenClient';

// Immer per Request server-rendern; Zugriffskontrolle über die Middleware.
export const dynamic = 'force-dynamic';

export default async function AdminSchaedenPage() {
  const { reports } = await loadDamageReports();
  return <SchaedenClient initialReports={reports as unknown as DamageReport[]} />;
}

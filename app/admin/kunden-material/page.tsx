import { Suspense } from 'react';
import { loadCustomerUgc } from '@/lib/admin/load-customer-ugc';
import KundenMaterialClient from './KundenMaterialClient';
import type { ComponentProps } from 'react';

// Immer per Request server-rendern; Zugriffskontrolle über die Middleware.
export const dynamic = 'force-dynamic';

type ClientProps = ComponentProps<typeof KundenMaterialClient>;

export default async function KundenMaterialPage() {
  // Default-Filter 'pending' — passend zum Initial-State im Client.
  const { entries, counts } = await loadCustomerUgc({ status: 'pending' });
  return (
    // Suspense-Grenze, weil der Client useSearchParams() nutzt.
    <Suspense fallback={null}>
      <KundenMaterialClient
        initialEntries={entries as unknown as ClientProps['initialEntries']}
        initialCounts={counts as unknown as ClientProps['initialCounts']}
      />
    </Suspense>
  );
}

'use client';

import { ShoppingCart, Plus } from 'lucide-react';
import { PageHeader, ButtonLink } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Verkäufe (Zubehör-Verkauf + Stripe-Link, statisch). */

export default function VerkaeufePage() {
  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader
        title="Verkäufe"
        subtitle="Zubehör (z. B. Speicherkarten) verkaufen — Rechnung + Stripe-Zahlungslink."
        actions={<ButtonLink href="/admin/verkauf/neu" variant="primary" icon={Plus}>Neuer Verkauf</ButtonLink>}
      />
      <div className="bg-white border border-dashed border-slate-300 rounded-lg p-10 text-center">
        <ShoppingCart size={22} className="mx-auto text-slate-300 mb-2" />
        <p className="font-medium text-slate-700">Noch keine Verkäufe</p>
        <p className="text-slate-400 mt-1 text-[12px]">Klick auf „Neuer Verkauf“, um einen Artikel an einen Kunden zu verkaufen.</p>
      </div>
    </div>
  );
}

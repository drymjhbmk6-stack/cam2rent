'use client';

import { Download } from 'lucide-react';
import { PageHeader, Button, DataTable, StatusChip } from '@/components/admin/ui';
import type { Column } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Social-Vorlagen (statisch). */

type Template = {
  id: string;
  name: string;
  trigger: string;
  prompt: string;
  platforms: ('fb' | 'ig')[];
  aktiv: boolean;
};

const TEMPLATES: Template[] = [
  { id: 'v1', name: 'Blog-Ankündigung', trigger: 'blog_publish', prompt: 'Schreibe einen Post, der den neuen Blog-Artikel „{title}“ anteasert und zum Lesen einlädt.', platforms: ['fb', 'ig'], aktiv: true },
  { id: 'v2', name: 'Neues Produkt', trigger: 'product_new', prompt: 'Stelle das neue Produkt {product_name} vor — Hauptvorteil hervorheben, Miet-CTA.', platforms: ['fb', 'ig'], aktiv: true },
  { id: 'v3', name: 'Gutschein / Aktion', trigger: 'coupon_new', prompt: 'Bewirb die Aktion {coupon_code} mit Dringlichkeit und klarem Vorteil.', platforms: ['fb', 'ig'], aktiv: true },
  { id: 'v4', name: 'Community / Kundenmaterial', trigger: 'ugc_featured', prompt: 'Teile das Kundenmaterial wertschätzend und ermutige andere zum Einsenden.', platforms: ['ig'], aktiv: true },
  { id: 'v5', name: 'Frage an die Community', trigger: 'manual', prompt: 'Stelle eine offene Frage rund um Action-Cams, die zum Kommentieren einlädt.', platforms: ['fb', 'ig'], aktiv: false },
];

function PlatformBadges({ platforms }: { platforms: ('fb' | 'ig')[] }) {
  return (
    <span className="inline-flex gap-1">
      {platforms.includes('fb') && (
        <span className="inline-flex items-center justify-center px-1.5 h-5 rounded bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-semibold" title="Facebook">FB</span>
      )}
      {platforms.includes('ig') && (
        <span className="inline-flex items-center justify-center px-1.5 h-5 rounded bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-semibold" title="Instagram">IG</span>
      )}
    </span>
  );
}

export default function SocialVorlagenPage() {
  const columns: Column<Template>[] = [
    { key: 'name', header: 'Name', cell: (t) => <span className="font-medium text-slate-900 text-[13px]">{t.name}</span> },
    {
      key: 'trigger',
      header: 'Trigger',
      className: 'hidden sm:table-cell',
      cell: (t) => <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">{t.trigger}</span>,
    },
    {
      key: 'prompt',
      header: 'Caption-Prompt',
      className: 'hidden lg:table-cell',
      cell: (t) => <span className="block max-w-sm truncate text-slate-500 text-[12px]">{t.prompt}</span>,
    },
    { key: 'platforms', header: 'Kanäle', width: '72px', cell: (t) => <PlatformBadges platforms={t.platforms} /> },
    { key: 'aktiv', header: 'Status', align: 'right', cell: (t) => <StatusChip tone={t.aktiv ? 'emerald' : 'slate'}>{t.aktiv ? 'Aktiv' : 'Inaktiv'}</StatusChip> },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Vorlagen"
        subtitle="Caption-Prompts pro Trigger — steuern die automatische KI-Generierung."
        actions={<Button variant="secondary" size="sm" icon={Download}>Standard-Vorlagen importieren</Button>}
      />
      <DataTable columns={columns} rows={TEMPLATES} rowKey={(t) => t.id} onRowClick={() => {}} />
    </div>
  );
}

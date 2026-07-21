'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader, ButtonLink, FilterPills, DataTable, StatusChip } from '@/components/admin/ui';
import type { Column, PillDef, ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Social Posts (Liste, statisch). */

type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

type SocialPost = {
  id: string;
  platforms: ('fb' | 'ig')[];
  caption: string;
  typ: string;
  status: PostStatus;
  datum: string;
};

const STATUS: Record<PostStatus, { label: string; tone: ChipTone }> = {
  draft: { label: 'Entwurf', tone: 'slate' },
  scheduled: { label: 'Geplant', tone: 'cyan' },
  published: { label: 'Veröffentlicht', tone: 'emerald' },
  failed: { label: 'Fehler', tone: 'rose' },
};

const POSTS: SocialPost[] = [
  { id: 'sp-1', platforms: ['fb', 'ig'], caption: 'Wintersport steht vor der Tür — sicher dir jetzt deine Insta360 X4 fürs nächste Abenteuer auf der Piste. 🎿❄️', typ: 'Produkt', status: 'scheduled', datum: '24.07. 09:00' },
  { id: 'sp-2', platforms: ['ig'], caption: 'Kundenmaterial der Woche: unser Mieter hat die GoPro Hero 13 mit an den Gardasee genommen. Traumhafte Aufnahmen! 🌊', typ: 'Community', status: 'published', datum: '21.07. 18:30' },
  { id: 'sp-3', platforms: ['fb', 'ig'], caption: 'Neu im Verleih: das DJI Osmo Action 5 Pro Basic Set — perfekt für Einsteiger. Jetzt zum Aktionspreis mieten.', typ: 'Aktion', status: 'draft', datum: '—' },
  { id: 'sp-4', platforms: ['fb'], caption: '5 Tipps, wie du das Beste aus deiner Action-Cam am Strand herausholst. Neuer Blog-Artikel ist online! ☀️', typ: 'Blog', status: 'published', datum: '19.07. 12:00' },
  { id: 'sp-5', platforms: ['fb', 'ig'], caption: 'Sommer-Special: Gratis-Versand ab 79 € Mietwert. Nur noch bis Ende Juli. Code: SOMMER25', typ: 'Aktion', status: 'failed', datum: '18.07. 10:00' },
  { id: 'sp-6', platforms: ['ig'], caption: 'Frage an euch: Wassersport oder Bergtour — wofür würdet ihr eure nächste Cam mieten? 👇', typ: 'Frage', status: 'draft', datum: '—' },
];

const PILLS: PillDef[] = [
  { key: 'alle', label: 'Alle', count: 6 },
  { key: 'draft', label: 'Entwurf', count: 2, tone: 'slate' },
  { key: 'scheduled', label: 'Geplant', count: 1, tone: 'cyan' },
  { key: 'published', label: 'Veröffentlicht', count: 2, tone: 'emerald' },
  { key: 'failed', label: 'Fehler', count: 1, tone: 'rose' },
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

export default function SocialPostsPage() {
  const [filter, setFilter] = useState('alle');
  const rows = filter === 'alle' ? POSTS : POSTS.filter((p) => p.status === filter);

  const columns: Column<SocialPost>[] = [
    { key: 'platforms', header: 'Kanäle', width: '72px', cell: (p) => <PlatformBadges platforms={p.platforms} /> },
    {
      key: 'caption',
      header: 'Caption',
      cell: (p) => <span className="block max-w-md truncate text-slate-700 text-[13px]">{p.caption}</span>,
    },
    {
      key: 'typ',
      header: 'Typ',
      className: 'hidden md:table-cell',
      cell: (p) => <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">{p.typ}</span>,
    },
    { key: 'status', header: 'Status', cell: (p) => <StatusChip tone={STATUS[p.status].tone}>{STATUS[p.status].label}</StatusChip> },
    {
      key: 'datum',
      header: 'Datum',
      align: 'right',
      className: 'hidden sm:table-cell',
      cell: (p) => <span className="font-mono text-[11px] text-slate-400">{p.datum}</span>,
    },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Social Posts"
        subtitle="Facebook &amp; Instagram — Entwürfe, geplante und veröffentlichte Beiträge."
        actions={<ButtonLink href="/admin/social/neu" variant="primary" icon={Plus}>Neuer Post</ButtonLink>}
      />
      <FilterPills pills={PILLS} active={filter} onChange={setFilter} />
      <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={() => {}} empty="Keine Posts in dieser Kategorie." />
    </div>
  );
}

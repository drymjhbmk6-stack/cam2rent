'use client';

import { Plus, Settings } from 'lucide-react';
import { PageHeader, DataTable, StatusChip, Button, ButtonLink } from '@/components/admin/ui';
import type { Column } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Reel-Vorlagen (statisch). */

type Template = {
  id: string;
  name: string;
  typ: 'Stock' | 'Motion';
  dauer: number;
  hashtags: string;
  aktiv: boolean;
};

const TEMPLATES: Template[] = [
  { id: 't1', name: 'Produkt-Spotlight', typ: 'Stock', dauer: 20, hashtags: '#actioncam #gopro #verleih', aktiv: true },
  { id: 't2', name: 'Angebot', typ: 'Motion', dauer: 15, hashtags: '#angebot #rabatt #cam2rent', aktiv: true },
  { id: 't3', name: 'Saison-Tipp', typ: 'Stock', dauer: 25, hashtags: '#outdoor #abenteuer #tipps', aktiv: true },
  { id: 't4', name: 'Ankündigung', typ: 'Motion', dauer: 12, hashtags: '#neu #cam2rent', aktiv: false },
];

const COLUMNS: Column<Template>[] = [
  { key: 'name', header: 'Name', cell: (t) => <span className="font-medium text-slate-900">{t.name}</span> },
  {
    key: 'typ',
    header: 'Typ',
    cell: (t) => <StatusChip tone={t.typ === 'Stock' ? 'cyan' : 'blue'}>{t.typ}</StatusChip>,
  },
  {
    key: 'dauer',
    header: 'Dauer',
    align: 'right',
    cell: (t) => <span className="font-mono text-[12px] text-slate-600">{t.dauer}s</span>,
  },
  {
    key: 'hashtags',
    header: 'Hashtags',
    cell: (t) => <span className="text-slate-500 text-[12px]">{t.hashtags}</span>,
    className: 'hidden md:table-cell',
  },
  {
    key: 'aktiv',
    header: 'Aktiv',
    align: 'right',
    cell: (t) => <StatusChip tone={t.aktiv ? 'emerald' : 'slate'}>{t.aktiv ? 'Aktiv' : 'Inaktiv'}</StatusChip>,
  },
];

export default function ReelVorlagenPage() {
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Reel-Vorlagen"
        subtitle="Skript-Prompt, Standard-Dauer und Look pro Vorlage — Grundlage für jede Generierung."
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink href="/admin/social/reels/einstellungen" variant="secondary" icon={Settings}>Einstellungen</ButtonLink>
            <Button variant="primary" icon={Plus}>Neue Vorlage</Button>
          </div>
        }
      />

      <DataTable columns={COLUMNS} rows={TEMPLATES} rowKey={(t) => t.id} onRowClick={() => {}} />

      <p className="text-[12px] text-slate-500">
        <StatusChip tone="cyan">Stock</StatusChip> holt echte Clips von Pexels/Pixabay,{' '}
        <StatusChip tone="blue">Motion</StatusChip> rendert Farbflächen mit animiertem Text (0 € externe Kosten).
      </p>
    </div>
  );
}

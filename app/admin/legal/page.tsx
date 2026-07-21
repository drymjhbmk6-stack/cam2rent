'use client';

import { FileCheck2, FileText, Sparkles } from 'lucide-react';
import { PageHeader, DataTable, Button, ButtonLink, StatusChip } from '@/components/admin/ui';
import type { Column } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Rechtstexte (versionierte Dokumente, statisch). */

type Doc = {
  slug: string;
  titel: string;
  version: string;
  datum: string;
  status: 'aktiv' | 'entwurf';
};

const DOCS: Doc[] = [
  { slug: 'agb', titel: 'AGB', version: 'v3', datum: '12.05.2026', status: 'aktiv' },
  { slug: 'datenschutz', titel: 'Datenschutzerklärung', version: 'v5', datum: '07.05.2026', status: 'aktiv' },
  { slug: 'impressum', titel: 'Impressum', version: 'v2', datum: '01.03.2026', status: 'aktiv' },
  { slug: 'widerruf', titel: 'Widerrufsbelehrung', version: 'v2', datum: '18.04.2026', status: 'aktiv' },
  { slug: 'haftungsbedingungen', titel: 'Haftungsbedingungen', version: 'v4', datum: '04.05.2026', status: 'aktiv' },
];

export default function AdminLegalPage() {
  const columns: Column<Doc>[] = [
    {
      key: 'titel',
      header: 'Dokument',
      cell: (d) => (
        <span className="flex items-center gap-2 font-medium text-slate-900">
          <FileText size={15} className="text-slate-400" />
          {d.titel}
        </span>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      cell: (d) => <span className="font-mono text-[12px] text-cyan-700">{d.version}</span>,
    },
    {
      key: 'datum',
      header: 'Zuletzt geändert',
      cell: (d) => <span className="text-slate-500 text-[12px]">{d.datum}</span>,
      className: 'hidden sm:table-cell',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (d) => <StatusChip tone={d.status === 'aktiv' ? 'emerald' : 'amber'}>{d.status === 'aktiv' ? 'Aktiv' : 'Entwurf'}</StatusChip>,
    },
    {
      key: 'aktion',
      header: '',
      align: 'right',
      cell: (d) => (
        <span className="flex items-center justify-end gap-2">
          <ButtonLink href={`/admin/legal/${d.slug}?pdf=1`} variant="secondary" size="sm">PDF</ButtonLink>
          <ButtonLink href={`/admin/legal/${d.slug}`} variant="primary" size="sm">Bearbeiten</ButtonLink>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Rechtstexte"
        subtitle="Versionierte Dokumente — jede Änderung erzeugt eine neue, archivierte Fassung."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={Sparkles}>KI-Prüfung</Button>
            <Button variant="secondary" size="sm" icon={FileCheck2}>Muster-Vertrag PDF</Button>
          </>
        }
      />
      <DataTable columns={columns} rows={DOCS} rowKey={(d) => d.slug} />
      <p className="text-slate-500 text-[12px]">
        Beim Veröffentlichen wird automatisch ein PDF archiviert und eine Erinnerung erstellt, welche Vertragsparagraphen
        zu prüfen sind.
      </p>
    </div>
  );
}

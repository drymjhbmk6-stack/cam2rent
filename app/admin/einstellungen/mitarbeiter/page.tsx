'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, StatusChip, Button } from '@/components/admin/ui';
import type { Column } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Mitarbeiterkonten & Berechtigungen (statisch). */

type Employee = {
  id: string;
  name: string;
  mail: string;
  rolle: 'owner' | 'employee';
  aktiv: boolean;
  permissions: string[];
  letzterLogin: string;
};

const PERM_LABEL: Record<string, string> = {
  tagesgeschaeft: 'Tagesgeschäft',
  kunden: 'Kunden',
  katalog: 'Katalog',
  preise: 'Preise',
  content: 'Content',
  finanzen: 'Finanzen',
  berichte: 'Berichte',
  system: 'System',
  mitarbeiter_verwalten: 'Mitarbeiter',
};

const EMPLOYEES: Employee[] = [
  {
    id: 'e1',
    name: 'Lars Schickel',
    mail: 'lars@cam2rent.de',
    rolle: 'owner',
    aktiv: true,
    permissions: Object.keys(PERM_LABEL),
    letzterLogin: 'heute, 08:14',
  },
  {
    id: 'e2',
    name: 'Marie Habicht',
    mail: 'marie@cam2rent.de',
    rolle: 'employee',
    aktiv: true,
    permissions: ['tagesgeschaeft', 'kunden', 'katalog'],
    letzterLogin: 'gestern, 17:42',
  },
  {
    id: 'e3',
    name: 'Jonas Weller',
    mail: 'jonas@cam2rent.de',
    rolle: 'employee',
    aktiv: true,
    permissions: ['finanzen', 'berichte'],
    letzterLogin: 'vor 3 Tagen',
  },
  {
    id: 'e4',
    name: 'Aylin Kaya',
    mail: 'aylin@cam2rent.de',
    rolle: 'employee',
    aktiv: false,
    permissions: ['content'],
    letzterLogin: 'vor 6 Wochen',
  },
];

export default function MitarbeiterPage() {
  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Mitarbeiter',
      cell: (e) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium text-slate-900">
            {e.name}
            {!e.aktiv && <StatusChip tone="slate">inaktiv</StatusChip>}
          </div>
          <div className="text-[12px] text-slate-500">{e.mail}</div>
        </div>
      ),
    },
    {
      key: 'rolle',
      header: 'Rolle',
      cell: (e) => (
        <StatusChip tone={e.rolle === 'owner' ? 'cyan' : 'slate'}>
          {e.rolle === 'owner' ? 'Owner' : 'Mitarbeiter'}
        </StatusChip>
      ),
    },
    {
      key: 'perms',
      header: 'Berechtigungen',
      className: 'hidden md:table-cell',
      cell: (e) =>
        e.rolle === 'owner' ? (
          <span className="text-[11px] text-cyan-700">Alle Bereiche</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {e.permissions.map((p) => (
              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {PERM_LABEL[p] ?? p}
              </span>
            ))}
          </div>
        ),
    },
    {
      key: 'login',
      header: 'Letzter Login',
      className: 'hidden lg:table-cell',
      cell: (e) => <span className="text-[12px] text-slate-500">{e.letzterLogin}</span>,
    },
    {
      key: 'aktion',
      header: '',
      align: 'right',
      cell: (e) => (
        <span className="flex items-center justify-end gap-1.5">
          <Button variant="secondary" size="sm" icon={Pencil}>Bearbeiten</Button>
          <Button variant="destructive" size="sm" icon={Trash2} disabled={e.rolle === 'owner'} title={e.rolle === 'owner' ? 'Owner kann nicht gelöscht werden' : undefined} />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Mitarbeiter"
        subtitle="Konten & granulare Berechtigungen. Der Owner sieht immer alle Bereiche."
        actions={<Button variant="primary" size="sm" icon={Plus}>Mitarbeiter anlegen</Button>}
      />
      <DataTable columns={columns} rows={EMPLOYEES} rowKey={(e) => e.id} />
      <p className="text-slate-500 text-[12px]">
        Änderungen an Rolle, Passwort oder Berechtigungen melden den betroffenen Mitarbeiter automatisch aus allen
        aktiven Sitzungen ab.
      </p>
    </div>
  );
}

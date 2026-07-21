'use client';

import { useState } from 'react';
import { FileUp, ScanLine, CheckCircle2 } from 'lucide-react';
import {
  PageHeader, DataTable, StatusChip, FilterPills, Button,
} from '@/components/admin/ui';
import type { Column, PillDef, ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Belege-Liste (statisch). */

type Beleg = {
  nr: string;
  lieferant: string;
  datum: string;
  monat: string;
  brutto: string;
  bruttoNum: number;
  status: 'festgeschrieben' | 'entwurf';
  ocr: 'ok' | 'laeuft' | 'fehler';
};

const BELEGE: Beleg[] = [
  { nr: 'BELEG-2026-00042', lieferant: 'DJI Store Europe', datum: '14.06.2026', monat: 'jun', brutto: '396,00 €', bruttoNum: 396.0, status: 'entwurf', ocr: 'ok' },
  { nr: 'BELEG-2026-00041', lieferant: 'Amazon Business', datum: '11.06.2026', monat: 'jun', brutto: '89,70 €', bruttoNum: 89.7, status: 'entwurf', ocr: 'laeuft' },
  { nr: 'BELEG-2026-00040', lieferant: 'Verpackungsmarkt24', datum: '04.06.2026', monat: 'jun', brutto: '31,80 €', bruttoNum: 31.8, status: 'festgeschrieben', ocr: 'ok' },
  { nr: 'BELEG-2026-00039', lieferant: 'Stripe Payments', datum: '02.06.2026', monat: 'jun', brutto: '8,42 €', bruttoNum: 8.42, status: 'festgeschrieben', ocr: 'ok' },
  { nr: 'BELEG-2026-00038', lieferant: 'Rode Microphones', datum: '18.05.2026', monat: 'mai', brutto: '279,00 €', bruttoNum: 279.0, status: 'festgeschrieben', ocr: 'fehler' },
  { nr: 'BELEG-2026-00037', lieferant: 'Adobe Systems', datum: '10.05.2026', monat: 'mai', brutto: '59,49 €', bruttoNum: 59.49, status: 'festgeschrieben', ocr: 'ok' },
];

const STATUS: Record<Beleg['status'], { tone: ChipTone; label: string }> = {
  festgeschrieben: { tone: 'emerald', label: 'Festgeschrieben' },
  entwurf: { tone: 'amber', label: 'Entwurf' },
};

const OCR: Record<Beleg['ocr'], { cls: string; label: string }> = {
  ok: { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: 'OCR ✓' },
  laeuft: { cls: 'bg-cyan-50 text-cyan-700 border-cyan-200', label: 'OCR läuft' },
  fehler: { cls: 'bg-rose-50 text-rose-700 border-rose-200', label: 'OCR-Fehler' },
};

const MONATE: PillDef[] = [
  { key: 'alle', label: 'Alle 2026', count: 6 },
  { key: 'jun', label: 'Juni', count: 4, tone: 'cyan' },
  { key: 'mai', label: 'Mai', count: 2 },
];

function euro(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function BelegePage() {
  const [monat, setMonat] = useState('alle');
  const rows = monat === 'alle' ? BELEGE : BELEGE.filter((b) => b.monat === monat);
  const summe = rows.reduce((s, b) => s + b.bruttoNum, 0);

  const columns: Column<Beleg>[] = [
    { key: 'nr', header: 'Beleg-Nr.', cell: (b) => <span className="font-mono text-[11px] text-cyan-700">{b.nr}</span> },
    { key: 'lieferant', header: 'Lieferant', cell: (b) => <span className="font-medium text-slate-900">{b.lieferant}</span> },
    { key: 'datum', header: 'Datum', cell: (b) => <span className="text-slate-500 text-[12px]">{b.datum}</span>, className: 'hidden sm:table-cell' },
    { key: 'brutto', header: 'Brutto', align: 'right', cell: (b) => <span className="font-mono font-semibold">{b.brutto}</span> },
    { key: 'ocr', header: 'OCR', align: 'center', cell: (b) => <span className={`text-[10px] px-1.5 py-0.5 rounded border ${OCR[b.ocr].cls}`}>{OCR[b.ocr].label}</span>, className: 'hidden md:table-cell' },
    { key: 'status', header: 'Status', align: 'right', cell: (b) => <StatusChip tone={STATUS[b.status].tone}>{STATUS[b.status].label}</StatusChip> },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Belege"
        subtitle="Jede Ausgabe entsteht über einen Beleg — KI-OCR, Klassifizierung, dann lückenlose Belegnummer."
        actions={<Button variant="primary" size="sm" icon={FileUp}>Beleg hochladen</Button>}
      />
      <FilterPills pills={MONATE} active={monat} onChange={setMonat} />
      <DataTable columns={columns} rows={rows} rowKey={(b) => b.nr} onRowClick={() => {}} />
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5">
        <span className="text-[12px] text-slate-500">{rows.length} Belege{monat !== 'alle' ? ` · ${monat === 'jun' ? 'Juni' : 'Mai'} 2026` : ' · 2026'}</span>
        <span className="font-mono font-semibold text-slate-800">Summe brutto: {euro(summe)}</span>
      </div>
      <p className="text-slate-500 text-[12px] flex items-center gap-1.5">
        <ScanLine size={13} className="text-slate-400" />
        Duplikat-Erkennung greift bei gleicher Rechnungsnummer oder gleicher Summe + Datum. Festgeschriebene Belege
        <CheckCircle2 size={12} className="inline text-emerald-500 mx-0.5" />
        sind gesperrt und tragen eine lückenlose Belegnummer.
      </p>
    </div>
  );
}

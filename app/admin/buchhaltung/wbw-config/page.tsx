'use client';

import { useState } from 'react';
import { Save, GitBranch } from 'lucide-react';
import {
  PageHeader, Panel, DataTable, Button,
} from '@/components/admin/ui';
import type { Column } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Wiederbeschaffungswert-Konfiguration (statisch). */

type KatCfg = { key: string; label: string; floor: number; monate: number };

const KATEGORIEN: KatCfg[] = [
  { key: 'action-cam', label: 'Action-Cam', floor: 40, monate: 36 },
  { key: '360-cam', label: '360°-Kamera', floor: 45, monate: 36 },
  { key: 'zubehoer', label: 'Zubehör', floor: 30, monate: 24 },
];

type Vorschau = { monate: string; wert: string; hinweis?: boolean };
const VORSCHAU: Vorschau[] = [
  { monate: '0 (Kauf)', wert: '399,00 €' },
  { monate: '6 Monate', wert: '359,10 €' },
  { monate: '12 Monate', wert: '319,20 €' },
  { monate: '24 Monate', wert: '239,40 €' },
  { monate: '36 Monate', wert: '159,60 €', hinweis: true },
  { monate: '48 Monate', wert: '159,60 €', hinweis: true },
];

function NumField({ value, suffix }: { value: number; suffix: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="font-mono text-[13px] text-slate-800 tabular-nums">{value}</span>
      <span className="text-[11px] text-slate-400">{suffix}</span>
    </span>
  );
}

export default function WbwConfigPage() {
  const [saved] = useState(false);

  const columns: Column<Vorschau>[] = [
    { key: 'monate', header: 'Alter', cell: (r) => <span className="text-slate-600 text-[12px]">{r.monate}</span> },
    { key: 'wert', header: 'Zeitwert', align: 'right', cell: (r) => <span className={`font-mono font-semibold ${r.hinweis ? 'text-amber-600' : 'text-slate-800'}`}>{r.wert}</span> },
    { key: 'note', header: '', align: 'right', cell: (r) => (r.hinweis ? <span className="text-[10px] text-amber-600">Floor erreicht</span> : null), className: 'hidden sm:table-cell' },
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader
        title="Wiederbeschaffungswert (WBW)"
        subtitle="Floor-Prozent und Nutzungsdauer je Kategorie — Basis für Kaution, Vertrag und Schadensersatz."
        actions={<Button variant="primary" size="sm" icon={Save}>Speichern</Button>}
      />

      <Panel title="Floor &amp; Nutzungsdauer je Kategorie">
        <div className="divide-y divide-slate-100">
          {KATEGORIEN.map((k) => (
            <div key={k.key} className="flex items-center gap-3 py-2.5 flex-wrap">
              <span className="font-medium text-slate-900 w-32 shrink-0">{k.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">Floor</span>
                <NumField value={k.floor} suffix="%" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">Nutzungsdauer</span>
                <NumField value={k.monate} suffix="Monate" />
              </div>
            </div>
          ))}
        </div>
        {saved && <p className="text-emerald-600 text-[12px] mt-2">Gespeichert.</p>}
      </Panel>

      <Panel title="Live-Vorschau · Action-Cam, Kaufpreis 399,00 €">
        <p className="text-[12px] text-slate-500 mb-2">
          Lineare Wertminderung von 399,00 € auf den Floor (40 % = 159,60 €) über 36 Monate, danach konstant.
        </p>
        <DataTable columns={columns} rows={VORSCHAU} rowKey={(r) => r.monate} />
      </Panel>

      <Panel title="Entscheidungsbaum">
        <ol className="space-y-2 text-[12px] text-slate-600">
          <li className="flex gap-2">
            <span className="font-mono font-semibold text-cyan-600 shrink-0">1.</span>
            <span><span className="font-medium text-slate-800">Override gesetzt?</span> — Ein manuell hinterlegter Wert hat immer Vorrang und wird direkt zurückgegeben.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono font-semibold text-cyan-600 shrink-0">2.</span>
            <span><span className="font-medium text-slate-800">Kein Kaufpreis?</span> — Ohne Netto-Kaufpreis liefert die Berechnung „Nicht gesetzt“, keine geratene Zahl.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono font-semibold text-cyan-600 shrink-0">3.</span>
            <span><span className="font-medium text-slate-800">Sonst:</span> lineare Formel bis zum Floor-Prozent des Kaufpreises über die Nutzungsdauer — danach bleibt der Wert konstant.</span>
          </li>
        </ol>
        <p className="text-slate-500 text-[12px] mt-3 flex items-center gap-1.5">
          <GitBranch size={13} className="text-slate-400" />
          Der WBW lebt getrennt vom steuerlichen Buchwert (AfA) — abgeschrieben heißt nicht wertlos.
        </p>
      </Panel>
    </div>
  );
}

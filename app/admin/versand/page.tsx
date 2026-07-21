'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Package, ExternalLink, CheckCircle2, MapPin, Truck, ArrowLeftRight } from 'lucide-react';
import { PageHeader, FilterPills, StatusChip } from '@/components/admin/ui';
import type { PillDef } from '@/components/admin/ui';
import { SHIPMENTS, type Shipment } from '@/lib/admin-mock';

/* cam2rent Admin 2.0 — Versand & Rückgabe (mit integriertem Tracking, statisch). */

const FILTERS: { key: Shipment['filter']; label: string; tone: PillDef['tone'] }[] = [
  { key: 'versenden', label: 'Zu versenden', tone: 'cyan' },
  { key: 'unterwegs', label: 'Unterwegs', tone: 'blue' },
  { key: 'pruefen', label: 'Rückgabe prüfen', tone: 'rose' },
  { key: 'fertig', label: 'Abgeschlossen', tone: 'slate' },
];

const TRACK_TONE = { emerald: 'emerald', amber: 'amber', blue: 'blue' } as const;
const BAR_TONE: Record<Shipment['filter'], string> = {
  versenden: 'bg-cyan-500', unterwegs: 'bg-blue-500', pruefen: 'bg-rose-500', fertig: 'bg-slate-400',
};

export default function VersandPage() {
  const [filter, setFilter] = useState<Shipment['filter']>('versenden');
  const list = SHIPMENTS.filter((s) => s.filter === filter);

  const pills: PillDef[] = FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    tone: f.tone,
    count: SHIPMENTS.filter((s) => s.filter === f.key).length,
  }));

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Versand & Rückgabe" subtitle="Rausschicken, Tracking verfolgen, Rückgaben abschließen." />

      <div className="flex items-center gap-3 flex-wrap">
        <FilterPills pills={pills} active={filter} onChange={(k) => setFilter(k as Shipment['filter'])} />
        <button className="ml-auto flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-800">
          <Package size={13} />Archiv (6)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {list.length > 0 ? (
          list.map((s, i) => {
            const ActionIcon = filter === 'pruefen' ? CheckCircle2 : filter === 'versenden' ? Package : MapPin;
            return (
              <div key={i} className="bg-white border border-slate-200 rounded-lg overflow-hidden flex">
                <span className={`w-1 ${BAR_TONE[s.filter]}`} />
                <div className="flex-1 px-3 py-3 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500 inline-flex items-center gap-1">
                      {s.richtung === 'Retoure' ? <ArrowLeftRight size={10} /> : <Truck size={10} />}{s.richtung}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">{s.carrier}</span>
                    <span className="ml-auto font-mono text-[11px] text-cyan-700">{s.buchung}</span>
                  </div>
                  <div className="font-medium text-slate-900">{s.modell}</div>
                  <div className="text-slate-500 text-[12px]">{s.kunde} · {s.zeitraum}</div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <StatusChip tone={TRACK_TONE[s.trackTone]}><Package size={11} />{s.trackStatus}</StatusChip>
                    <span className="font-mono text-[10px] text-slate-400 truncate">{s.tracking}</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <button className="flex items-center gap-1 text-[11px] text-cyan-700 hover:underline"><ExternalLink size={12} />Tracking öffnen</button>
                    <Link
                      href={`/admin/buchungen/${s.buchung}`}
                      className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium ${
                        filter === 'pruefen' ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'border border-slate-200 bg-white hover:border-cyan-400 hover:text-cyan-700'
                      }`}
                      style={{ textDecoration: 'none' }}
                    >
                      <ActionIcon size={13} />{s.nextAction}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="col-span-2 text-center text-slate-400 py-10 bg-white rounded-lg border border-slate-200">Keine Sendungen in diesem Status.</p>
        )}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronRight, FileText, CircleDot, Truck, ArrowLeftRight, Package } from 'lucide-react';
import { PageHeader, Panel, StatRows, BookingStatusChip } from '@/components/admin/ui';
import { BOOKINGS, DASHBOARD_STATS } from '@/lib/admin-mock';

/* cam2rent Admin 2.0 — Dashboard (reine Übersicht, statisch).
   Kein Aufgaben-Block hier — der lebt im Tagesgeschäft. */

const FEED = [
  { icon: Truck, tone: 'text-cyan-500', t: 'Etikett erstellt — GoPro Hero13 · Amreswar V.', d: 'vor 2 Std' },
  { icon: CheckCircle2, tone: 'text-emerald-500', t: 'Rückgabe abgeschlossen — Jennifer Jungbluth', d: 'gestern' },
  { icon: ArrowLeftRight, tone: 'text-amber-500', t: 'Retoure eingetroffen — OSMO Action 5 Pro', d: 'gestern' },
  { icon: Package, tone: 'text-blue-500', t: 'Zugestellt — DJI Osmo Nano · Peter Vieler', d: 'vor 3 Tagen' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Dashboard" subtitle="Wie's steht — auf einen Blick." />

      <Link
        href="/admin/tagesgeschaeft"
        className="flex items-center gap-3 px-4 py-3 rounded-lg bg-cyan-50 border border-cyan-200 hover:bg-cyan-100 transition-colors"
        style={{ textDecoration: 'none' }}
      >
        <CheckCircle2 size={18} className="text-cyan-600 shrink-0" />
        <span className="flex-1">
          <span className="block font-medium text-cyan-900">4 Aufgaben im Tagesgeschäft</span>
          <span className="block text-cyan-700/70 text-[11px]">2 Rückgaben prüfen · 1 Versand offen</span>
        </span>
        <ChevronRight size={16} className="text-cyan-500" />
      </Link>

      <StatRows
        groups={[
          { label: 'Heute', items: DASHBOARD_STATS.heute },
          { label: 'Umsatz', items: DASHBOARD_STATS.umsatz },
          { label: 'Bestand & Kunden', items: DASHBOARD_STATS.bestand },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Panel
            title={<span className="flex items-center gap-2"><FileText size={13} className="text-slate-400" />Letzte Buchungen</span>}
            right={<Link href="/admin/buchungen" className="text-[12px] text-cyan-600">Alle anzeigen</Link>}
            noBody
          >
            <div className="divide-y divide-slate-100">
              {BOOKINGS.slice(0, 4).map((b, i) => (
                <Link
                  key={b.id + i}
                  href={`/admin/buchungen/${b.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-slate-900">{b.modell}</div>
                    <div className="text-slate-500 text-[11px] truncate">{b.kunde} · {b.von}–{b.bis}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[13px]">{b.betrag}</div>
                    <div className="mt-0.5"><BookingStatusChip status={b.status} /></div>
                  </div>
                  <ChevronRight size={15} className="text-slate-300 shrink-0" />
                </Link>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="Aktivität" noBody>
          <ul className="divide-y divide-slate-100">
            {FEED.map((f, i) => {
              const Icon = f.icon;
              return (
                <li key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                  <Icon size={15} className={`${f.tone} mt-0.5 shrink-0`} />
                  <div className="min-w-0">
                    <div className="text-[12px] text-slate-700 leading-snug">{f.t}</div>
                    <div className="text-[10px] text-slate-400">{f.d}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <p className="text-slate-400 text-[11px] flex items-center gap-1">
        <CircleDot size={11} /> Website 2.0 · Design-Prototyp mit Beispieldaten · noch keine Live-Daten angebunden.
      </p>
    </div>
  );
}

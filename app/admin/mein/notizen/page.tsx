'use client';

import { useState } from 'react';
import { CheckSquare, Pin, Plus, Search, Users } from 'lucide-react';
import { PageHeader, Button } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Meine Notizen (privater Bereich, statisch). */

type Note = {
  id: string;
  titel: string;
  text: string;
  farbe: 'amber' | 'cyan' | 'emerald' | 'rose' | 'blue' | 'slate';
  pinned?: boolean;
  todo?: { erledigt: number; gesamt: number };
  geteilt?: boolean;
};

const NOTES: Note[] = [
  {
    id: 'n1',
    titel: 'Vor Sommer-Peak vorbereiten',
    text: 'Bestand Insta360 X5 hochfahren, Basis-Sets prüfen, Wassersport-Zubehör nachbestellen bevor die Buchungswelle kommt.',
    farbe: 'amber',
    pinned: true,
    todo: { erledigt: 2, gesamt: 5 },
  },
  {
    id: 'n2',
    titel: 'Retouren-Checkliste',
    text: 'Speicherkarte zurücksetzen · Akku laden · Gehäuse auf Kratzer prüfen · Seriennummer scannen · Zubehör zählen.',
    farbe: 'cyan',
    todo: { erledigt: 5, gesamt: 5 },
  },
  {
    id: 'n3',
    titel: 'Idee: Bundle „Vlog-Starter“',
    text: 'DJI Osmo Pocket 3 + Mikrofon + SD-Karte als Festpreis-Angebot für Content-Creator. Preis kalkulieren.',
    farbe: 'emerald',
  },
  {
    id: 'n4',
    titel: 'Firmware-Runde Q3',
    text: 'GoPro Hero 13 auf neueste Version bringen, danach installierte Version pro Exemplar im Inventar eintragen.',
    farbe: 'blue',
    todo: { erledigt: 1, gesamt: 4 },
    geteilt: true,
  },
  {
    id: 'n5',
    titel: 'Telefonat Steuerberater',
    text: 'GWG-Grenze für die neuen Ladestationen klären, Belege aus Mai nachreichen. Rückruf Donnerstag.',
    farbe: 'rose',
  },
  {
    id: 'n6',
    titel: 'Social-Content-Ideen',
    text: 'Unboxing-Reel Ace Pro 2 · Vergleich GoPro vs. DJI · Kundenmaterial vom letzten Tauchtrip anfragen.',
    farbe: 'slate',
    todo: { erledigt: 0, gesamt: 3 },
  },
];

const CARD: Record<Note['farbe'], string> = {
  amber: 'bg-amber-50 border-amber-200',
  cyan: 'bg-cyan-50 border-cyan-200',
  emerald: 'bg-emerald-50 border-emerald-200',
  rose: 'bg-rose-50 border-rose-200',
  blue: 'bg-blue-50 border-blue-200',
  slate: 'bg-slate-50 border-slate-200',
};

export default function MeineNotizenPage() {
  const [pins, setPins] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTES.map((n) => [n.id, !!n.pinned])),
  );

  const sorted = [...NOTES].sort((a, b) => Number(!!pins[b.id]) - Number(!!pins[a.id]));

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Meine Notizen"
        subtitle="Dein privater Notizblock — nur für dich sichtbar."
        actions={<Button variant="primary" size="sm" icon={Plus}>Neue Notiz</Button>}
      />

      <div className="flex items-center gap-2 max-w-md px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-400 text-[12px]">
        <Search size={13} />
        Notizen durchsuchen…
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((n) => {
          const pinned = !!pins[n.id];
          return (
            <div key={n.id} className={`rounded-lg border p-3 flex flex-col gap-2 ${CARD[n.farbe]}`}>
              <div className="flex items-start gap-2">
                <h3 className="font-semibold text-slate-900 text-[14px] leading-snug flex-1">{n.titel}</h3>
                <button
                  onClick={() => setPins((p) => ({ ...p, [n.id]: !p[n.id] }))}
                  title={pinned ? 'Loslösen' : 'Anpinnen'}
                  className={pinned ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'}
                >
                  <Pin size={15} className={pinned ? 'fill-amber-400' : ''} />
                </button>
              </div>
              <p className="text-[12px] text-slate-600 leading-relaxed">{n.text}</p>
              <div className="mt-auto flex items-center gap-2 flex-wrap pt-1">
                {n.todo && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                      n.todo.erledigt === n.todo.gesamt
                        ? 'text-emerald-700 bg-emerald-100 border-emerald-200'
                        : 'text-slate-600 bg-white/70 border-slate-200'
                    }`}
                  >
                    <CheckSquare size={11} />
                    {n.todo.erledigt}/{n.todo.gesamt} erledigt
                  </span>
                )}
                {n.geteilt && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border text-blue-700 bg-white/70 border-blue-200">
                    <Users size={11} />
                    Geteilt
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

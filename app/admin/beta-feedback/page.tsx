'use client';

import { Trash2 } from 'lucide-react';
import { PageHeader, Panel, MiniStat, StatusChip, Button } from '@/components/admin/ui';
import type { ChipTone } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Beta-Feedback (Design-Prototyp, statisch). */

type Feedback = {
  id: string;
  name: string;
  date: string;
  stars: number;
  nps: number;
  choices: string[];
  text: string;
};

const FEEDBACKS: Feedback[] = [
  {
    id: 'f1',
    name: 'Lena Brauer',
    date: '20.07.2026',
    stars: 5,
    nps: 9,
    choices: ['Übersichtlich', 'Vertrauenswürdig'],
    text: 'Buchung ging super schnell, die Preise sind fair. Der Set-Konfigurator hat mir die Auswahl leicht gemacht.',
  },
  {
    id: 'f2',
    name: 'Tobias Mahler',
    date: '19.07.2026',
    stars: 4,
    nps: 8,
    choices: ['Modern', 'Mobil getestet'],
    text: 'Sehr rund. Nur beim Kalender war kurz unklar, warum manche Tage gesperrt sind — ein Hinweis mehr wäre gut.',
  },
  {
    id: 'f3',
    name: 'Anonym',
    date: '18.07.2026',
    stars: 3,
    nps: 6,
    choices: ['Preise zu hoch?'],
    text: 'Grundsätzlich okay, aber die Kaution wirkte auf mich erst etwas abschreckend. Vielleicht früher erklären.',
  },
  {
    id: 'f4',
    name: 'Miriam Post',
    date: '17.07.2026',
    stars: 5,
    nps: 10,
    choices: ['Schnell', 'Klar strukturiert'],
    text: 'Genau das, was ich gesucht habe. Werde ich definitiv weiterempfehlen!',
  },
];

function Stars({ n }: { n: number }) {
  return (
    <span className="text-amber-400 text-[15px] tracking-tight">
      {'★'.repeat(n)}
      <span className="text-slate-200">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

function npsTone(nps: number): { tone: ChipTone; label: string } {
  if (nps >= 9) return { tone: 'emerald', label: 'Promoter' };
  if (nps >= 7) return { tone: 'amber', label: 'Passiv' };
  return { tone: 'rose', label: 'Kritiker' };
}

export default function BetaFeedbackPage() {
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Beta-Feedback" subtitle={`${FEEDBACKS.length} Rückmeldungen erhalten.`} />

      <div className="flex gap-3 flex-wrap">
        <MiniStat value="4" label="Feedbacks" />
        <MiniStat value="+50" label="NPS-Score" tone="emerald" />
        <MiniStat value="4,3" label="Ø Sterne" tone="accent" />
      </div>

      <div className="space-y-3">
        {FEEDBACKS.map((f) => {
          const nps = npsTone(f.nps);
          return (
            <Panel key={f.id}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900">{f.name}</span>
                    <Stars n={f.stars} />
                    <StatusChip tone={nps.tone}>
                      {nps.label} · {f.nps}/10
                    </StatusChip>
                    <span className="text-slate-400 text-[11px] ml-auto">{f.date}</span>
                  </div>
                  {f.choices.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {f.choices.map((c) => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-slate-600 text-[13px] leading-relaxed">{f.text}</p>
                </div>
                <Button size="sm" variant="destructive" icon={Trash2}>Löschen</Button>
              </div>
            </Panel>
          );
        })}
      </div>

      <p className="text-slate-400 text-[11px]">Design-Prototyp · Beispieldaten.</p>
    </div>
  );
}

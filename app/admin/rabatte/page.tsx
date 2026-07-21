import { Plus } from 'lucide-react';
import { PageHeader, Panel, Button, StatusChip } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Rabatte & Aktionen (Auto-Rabatt-Regeln, statisch). */

type Aktion = { name: string; wert: string; gueltig: string; exklusiv: boolean };
const AKTIONEN: Aktion[] = [
  { name: 'Sommeraktion — 25 % auf alles', wert: '25 %', gueltig: '01.06.–31.08.2026', exklusiv: true },
  { name: 'Insta360 X5 — Launch-Rabatt', wert: '15 %', gueltig: 'bis 15.05.2026', exklusiv: false },
  { name: 'GoPro-Sets — Bundle-Preis', wert: '10 %', gueltig: 'dauerhaft', exklusiv: false },
];

type Stufe = { ab: string; rabatt: string };
const MENGE: Stufe[] = [
  { ab: 'ab 7 Tagen', rabatt: '5 %' },
  { ab: 'ab 14 Tagen', rabatt: '10 %' },
  { ab: 'ab 30 Tagen', rabatt: '15 %' },
];
const FRUEH: Stufe[] = [
  { ab: 'ab 2 Wochen Vorlauf', rabatt: '3 %' },
  { ab: 'ab 4 Wochen Vorlauf', rabatt: '5 %' },
  { ab: 'ab 8 Wochen Vorlauf', rabatt: '8 %' },
];
const TREUE: Stufe[] = [
  { ab: 'ab 3 Buchungen', rabatt: '5 %' },
  { ab: 'ab 10 Buchungen', rabatt: '10 %' },
];

function StufenListe({ stufen }: { stufen: Stufe[] }) {
  return (
    <div className="divide-y divide-slate-100">
      {stufen.map((s) => (
        <div key={s.ab} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
          <span className="text-[13px] text-slate-700">{s.ab}</span>
          <span className="font-mono text-[13px] font-semibold text-cyan-700">{s.rabatt}</span>
        </div>
      ))}
      <div className="pt-3">
        <Button variant="secondary" size="sm" icon={Plus}>Stufe hinzufügen</Button>
      </div>
    </div>
  );
}

export default function RabattePage() {
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Rabatte & Aktionen"
        subtitle="Automatische Preisnachlässe — Aktionen, Mengen-, Frühbucher- und Treuerabatt."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          title="Produktaktionen"
          right={<Button variant="secondary" size="sm" icon={Plus}>Aktion</Button>}
          className="md:col-span-2"
        >
          <div className="divide-y divide-slate-100">
            {AKTIONEN.map((a) => (
              <div key={a.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-slate-900">{a.name}</span>
                    {a.exklusiv && <StatusChip tone="amber">nicht kombinierbar</StatusChip>}
                  </div>
                  <div className="text-slate-400 text-[11px]">{a.gueltig}</div>
                </div>
                <span className="font-mono text-[13px] font-semibold text-cyan-700 shrink-0">{a.wert}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Mengenrabatt">
          <p className="text-slate-500 text-[12px] mb-3">Je länger gemietet wird, desto günstiger.</p>
          <StufenListe stufen={MENGE} />
        </Panel>

        <Panel title="Frühbucherrabatt">
          <p className="text-slate-500 text-[12px] mb-3">Belohnt Vorlauf zwischen Buchung und Mietbeginn.</p>
          <StufenListe stufen={FRUEH} />
        </Panel>

        <Panel title="Treuerabatt" className="md:col-span-2">
          <p className="text-slate-500 text-[12px] mb-3">Stammkunden bekommen ab einer Zahl abgeschlossener Buchungen einen Nachlass.</p>
          <StufenListe stufen={TREUE} />
        </Panel>
      </div>
    </div>
  );
}

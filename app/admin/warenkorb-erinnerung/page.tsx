'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { PageHeader, Panel, MiniStat, Button, StatusChip } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — Warenkorb-Erinnerung (Settings, statisch). */

export default function WarenkorbErinnerungPage() {
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader
        title="Warenkorb-Erinnerung"
        subtitle="Automatische E-Mail an Kunden, die den Checkout nicht abgeschlossen haben."
      />

      <div className="flex flex-wrap gap-2">
        <MiniStat value="128" label="Erinnerungen versendet (30 T.)" tone="accent" />
        <MiniStat value="34 %" label="Rückkehr-Quote" tone="emerald" />
        <MiniStat value="19" label="Buchungen zurückgeholt" />
      </div>

      <Panel
        title="Einstellungen"
        right={enabled ? <StatusChip tone="emerald">Aktiv</StatusChip> : <StatusChip tone="slate">Aus</StatusChip>}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-slate-900">Erinnerung automatisch senden</div>
              <div className="text-slate-500 text-[12px]">Sendet eine E-Mail an eingeloggte Kunden mit gefülltem Warenkorb.</div>
            </div>
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-cyan-500' : 'bg-slate-300'}`}
              aria-pressed={enabled}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">Vorlauf bis zum Versand</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                defaultValue={4}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-900 focus:border-cyan-400 focus:outline-none"
              />
              <span className="text-slate-500 text-[13px]">Stunden nach dem letzten Warenkorb-Update</span>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">E-Mail-Vorschau</label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-400 text-[11px] mb-2">
                <Mail size={13} />
                <span>Betreff: Deine Kamera wartet noch auf dich</span>
              </div>
              <p className="text-[13px] text-slate-700 leading-relaxed">
                Hallo, du hattest eine <span className="font-medium">GoPro Hero 13</span> im Warenkorb — aber der Checkout ist
                noch offen. Sichere dir deinen Zeitraum, bevor jemand anderes bucht. Wir halten deinen Warenkorb noch kurz für dich.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary">Speichern</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

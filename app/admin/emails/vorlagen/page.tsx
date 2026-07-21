'use client';

import { Eye, Pencil } from 'lucide-react';
import { PageHeader, Button, StatusChip } from '@/components/admin/ui';

/* cam2rent Admin 2.0 — E-Mail-Vorlagen-Katalog (Design-Prototyp, statisch). */

type Template = {
  id: string;
  name: string;
  trigger: string;
  recipient: 'Kunde' | 'Admin';
  customized?: boolean;
};

const TEMPLATES: Template[] = [
  { id: 'booking_confirmation', name: 'Buchungsbestätigung', trigger: 'Nach erfolgreicher Zahlung an den Kunden.', recipient: 'Kunde', customized: true },
  { id: 'booking_admin', name: 'Neue Buchung (Admin)', trigger: 'Bei jeder neuen Buchung an das Support-Postfach.', recipient: 'Admin' },
  { id: 'shipping_confirmation', name: 'Versandbestätigung', trigger: 'Wenn das Paket als versendet markiert wird — mit Trackinglink.', recipient: 'Kunde' },
  { id: 'return_checklist', name: 'Rückgabe-Checkliste', trigger: 'Am letzten Miettag mit Checkliste als PDF-Anhang.', recipient: 'Kunde', customized: true },
  { id: 'payment_link', name: 'Zahlungs-Link', trigger: 'Wenn der Admin einen Zahlungslink für eine offene Buchung schickt.', recipient: 'Kunde' },
  { id: 'review_request', name: 'Bewertungsanfrage', trigger: '3 Tage nach Mietende — Google-Bewertung + 10 % Gutschein.', recipient: 'Kunde' },
  { id: 'verification_reminder', name: 'Verifizierungs-Erinnerung', trigger: 'Wenn der Ausweis vor Versand noch fehlt (T-5 bis T-3).', recipient: 'Kunde' },
  { id: 'weekly_report', name: 'Wochenbericht', trigger: 'Jeden Sonntag 18:30 mit Kennzahlen der Woche als PDF.', recipient: 'Admin' },
];

function Card({ t }: { t: Template }) {
  return (
    <div className={`bg-white border rounded-lg p-4 flex flex-col gap-3 ${t.customized ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="flex items-start gap-2">
        <h2 className="font-semibold text-slate-900 text-[14px] leading-tight flex-1">{t.name}</h2>
        <div className="flex items-center gap-1.5 shrink-0">
          {t.customized && <StatusChip tone="amber">angepasst</StatusChip>}
          <StatusChip tone={t.recipient === 'Kunde' ? 'cyan' : 'blue'}>{t.recipient}</StatusChip>
        </div>
      </div>
      <p className="text-slate-500 text-[12px] leading-relaxed flex-1">{t.trigger}</p>
      <div className="flex items-center gap-2">
        <Button size="sm" icon={Eye}>Vorschau</Button>
        <Button size="sm" variant="secondary" icon={Pencil}>Bearbeiten</Button>
      </div>
      <code className="text-[10px] text-slate-400 font-mono">{t.id}</code>
    </div>
  );
}

export default function EmailVorlagenPage() {
  const customized = TEMPLATES.filter((t) => t.customized).length;
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="E-Mail-Vorlagen"
        subtitle={`${TEMPLATES.length} Vorlagen · ${customized} angepasst — Betreff und Einleitungstext pro Vorlage überschreibbar.`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TEMPLATES.map((t) => (
          <Card key={t.id} t={t} />
        ))}
      </div>

      <p className="text-slate-400 text-[11px]">
        Tieferreichende Änderungen (Layout, Tabellen, Anhänge) werden weiterhin im Code gepflegt. Design-Prototyp.
      </p>
    </div>
  );
}

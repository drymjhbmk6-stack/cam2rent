import type { ReactNode } from 'react';

/* cam2rent Admin 2.0 — StatusChip
   Ein Farbsystem für alle Status-Pills. Die 13 Buchungs-Einzelstatus werden für
   Listen/Kalender auf 5 Gruppen gebündelt; im Detail bleiben die Einzelstatus. */

export type ChipTone =
  | 'emerald' // erledigt, bezahlt, frei, positiv
  | 'cyan' // versand, aktiv, info
  | 'blue' // beim Kunden / draußen / unterwegs
  | 'amber' // rückweg, wartend, intern
  | 'rose' // dringend, überfällig, fehler, destruktiv
  | 'slate'; // offen, neutral, null

const TONE: Record<ChipTone, string> = {
  emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cyan: 'text-cyan-700 bg-cyan-50 border-cyan-200',
  blue: 'text-blue-700 bg-blue-50 border-blue-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  rose: 'text-rose-700 bg-rose-50 border-rose-200',
  slate: 'text-slate-600 bg-slate-100 border-slate-200',
};

export function StatusChip({
  tone = 'slate',
  children,
  className = '',
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ── Buchungs-Status → Anzeige (Einzelstatus, für Detail/Listen-Spalte) ── */
export type BookingStatus =
  | 'pending_verification'
  | 'awaiting_payment'
  | 'confirmed'
  | 'preparing_shipment'
  | 'awaiting_pickup'
  | 'shipped'
  | 'delivered'
  | 'picked_up'
  | 'returned'
  | 'completed'
  | 'damaged'
  | 'cancelled';

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: ChipTone }> = {
  pending_verification: { label: 'Ausweis prüfen', tone: 'amber' },
  awaiting_payment: { label: 'Zahlung offen', tone: 'amber' },
  confirmed: { label: 'Bestätigt', tone: 'cyan' },
  preparing_shipment: { label: 'Wird versendet', tone: 'cyan' },
  awaiting_pickup: { label: 'Warten auf Abholung', tone: 'cyan' },
  shipped: { label: 'Versendet', tone: 'blue' },
  delivered: { label: 'Zugestellt', tone: 'blue' },
  picked_up: { label: 'Abgeholt', tone: 'blue' },
  returned: { label: 'Zurückgegeben', tone: 'emerald' },
  completed: { label: 'Abgeschlossen', tone: 'emerald' },
  damaged: { label: 'Schaden', tone: 'rose' },
  cancelled: { label: 'Storniert', tone: 'slate' },
};

/* ── 5 Statusgruppen (für Kalender/Timeline) ── */
export type StatusGroup = 'offen' | 'versand' | 'draussen' | 'rueckweg' | 'erledigt';

export const STATUS_GROUP: Record<StatusGroup, { label: string; tone: ChipTone; dot: string }> = {
  offen: { label: 'Offen', tone: 'slate', dot: 'bg-slate-400' },
  versand: { label: 'Versand', tone: 'cyan', dot: 'bg-cyan-500' },
  draussen: { label: 'Draußen', tone: 'blue', dot: 'bg-blue-500' },
  rueckweg: { label: 'Rückweg', tone: 'amber', dot: 'bg-amber-500' },
  erledigt: { label: 'Erledigt', tone: 'emerald', dot: 'bg-emerald-500' },
};

export function groupForStatus(s: BookingStatus): StatusGroup {
  switch (s) {
    case 'pending_verification':
    case 'awaiting_payment':
    case 'confirmed':
      return 'offen';
    case 'preparing_shipment':
    case 'awaiting_pickup':
      return 'versand';
    case 'shipped':
    case 'delivered':
    case 'picked_up':
      return 'draussen';
    case 'returned':
      return 'rueckweg';
    case 'completed':
    case 'damaged':
    case 'cancelled':
      return 'erledigt';
  }
}

export function BookingStatusChip({ status }: { status: BookingStatus }) {
  const s = BOOKING_STATUS[status] ?? { label: status, tone: 'slate' as ChipTone };
  return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
}

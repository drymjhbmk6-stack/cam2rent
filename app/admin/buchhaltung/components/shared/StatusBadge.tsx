'use client';

type BadgeVariant = 'green' | 'yellow' | 'red' | 'gray' | 'blue' | 'cyan' | 'orange';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  green:  { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.25)' },
  yellow: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  red:    { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: 'rgba(239,68,68,0.25)' },
  gray:   { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', border: 'rgba(100,116,139,0.25)' },
  blue:   { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.25)' },
  cyan:   { bg: 'rgba(6,182,212,0.12)',  color: '#06b6d4', border: 'rgba(6,182,212,0.25)' },
  orange: { bg: 'rgba(249,115,22,0.12)', color: '#f97316', border: 'rgba(249,115,22,0.25)' },
};

// Status → Badge-Variant Mapping
const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  // Rechnungen
  paid:           { label: 'Bezahlt',       variant: 'green' },
  open:           { label: 'Offen',         variant: 'yellow' },
  overdue:        { label: 'Überfällig',    variant: 'red' },
  cancelled:      { label: 'Storniert',     variant: 'gray' },
  partially_paid: { label: 'Teilbezahlt',   variant: 'blue' },
  // Gutschriften
  pending_review: { label: 'Entwurf',       variant: 'yellow' },
  approved:       { label: 'Freigegeben',   variant: 'cyan' },
  sent:           { label: 'Versendet',     variant: 'green' },
  rejected:       { label: 'Verworfen',     variant: 'gray' },
  // Mahnungen
  draft:          { label: 'Entwurf',       variant: 'yellow' },
  escalated:      { label: 'Eskaliert',     variant: 'red' },
  // Stripe
  matched:        { label: 'Verknüpft',     variant: 'green' },
  unmatched:      { label: 'Nicht zugeordnet', variant: 'yellow' },
  manual:         { label: 'Manuell',       variant: 'blue' },
  refunded:       { label: 'Erstattet',     variant: 'orange' },
  // Refund
  succeeded:      { label: 'Erfolgreich',   variant: 'green' },
  failed:         { label: 'Fehlgeschlagen', variant: 'red' },
  pending:        { label: 'Ausstehend',    variant: 'yellow' },
  not_applicable: { label: '—',             variant: 'gray' },
};

interface StatusBadgeProps {
  status: string;
  customLabel?: string;
}

export default function StatusBadge({ status, customLabel }: StatusBadgeProps) {
  const mapped = STATUS_MAP[status] || { label: status, variant: 'gray' as BadgeVariant };
  const style = VARIANT_STYLES[mapped.variant];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.border}`,
      whiteSpace: 'nowrap',
    }}>
      {customLabel || mapped.label}
    </span>
  );
}

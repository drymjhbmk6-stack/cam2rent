'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface Alert {
  id: string;
  alert_type: 'no_basic_set' | 'basic_set_unavailable' | 'set_unavailable' | 'accessory_unavailable';
  product_id: string | null;
  product_name: string | null;
  set_id: string | null;
  set_name: string | null;
  accessory_id: string | null;
  accessory_name: string | null;
  rental_from: string | null;
  rental_to: string | null;
  customer_email: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  resolved_note: string | null;
}

const TYPE_LABEL: Record<Alert['alert_type'], string> = {
  no_basic_set: 'Basis-Set fehlt',
  basic_set_unavailable: 'Basis-Set ausgebucht',
  set_unavailable: 'Set ausgebucht',
  accessory_unavailable: 'Zubehör ausgebucht',
};

const TYPE_HINT: Record<Alert['alert_type'], string> = {
  no_basic_set: 'Für diese Kamera ist kein Basis-Set hinterlegt. Im Admin unter "Sets" ein Set als Basis-Set für diese Kamera markieren.',
  basic_set_unavailable: 'Das Basis-Set für diese Kamera ist im gewünschten Zeitraum ausgebucht. Inventar prüfen oder Zubehör nachbestellen.',
  set_unavailable: 'Ein Set ist im Zeitraum ausgebucht. Inventar prüfen.',
  accessory_unavailable: 'Zubehör ist im Zeitraum ausgebucht. Inventar prüfen.',
};

const TYPE_COLOR: Record<Alert['alert_type'], string> = {
  no_basic_set: '#ef4444',
  basic_set_unavailable: '#f97316',
  set_unavailable: '#f59e0b',
  accessory_unavailable: '#eab308',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export default function VerfuegbarkeitAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/availability-alerts?open=${!showResolved}`);
      if (res.ok) {
        const json = await res.json();
        setAlerts(Array.isArray(json.alerts) ? json.alerts : []);
      }
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => { load(); }, [load]);

  async function handleResolve(id: string) {
    const note = window.prompt('Optional: Kurzer Kommentar zur Lösung (z.B. "Zubehör nachgekauft", "Set umkonfiguriert"):');
    if (note === null) return; // Abbruch
    setBusy(id);
    try {
      const res = await fetch('/api/admin/availability-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'resolve', note: note || undefined }),
      });
      if (res.ok) await load();
      else alert('Fehler beim Markieren als erledigt.');
    } finally {
      setBusy(null);
    }
  }

  async function handleReopen(id: string) {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/availability-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reopen' }),
      });
      if (res.ok) await load();
      else alert('Fehler beim Wiedereröffnen.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0a', color: '#e2e8f0', padding: '20px 16px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <AdminBackLink />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Verfügbarkeits-Alerts</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, marginBottom: 0 }}>
              Buchungen, die wegen ausgebuchter Sets/Zubehör oder fehlender Basis-Sets nicht abgeschlossen werden konnten.
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              style={{ accentColor: '#06b6d4' }}
            />
            Auch erledigte anzeigen
          </label>
        </div>

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Lädt…</p>
        ) : alerts.length === 0 ? (
          <div style={{ background: '#111827', borderRadius: 12, padding: 32, textAlign: 'center', border: '1px solid #1e293b' }}>
            <p style={{ color: '#10b981', fontSize: 18, fontWeight: 700, margin: 0 }}>
              ✓ Keine offenen Verfügbarkeits-Alerts
            </p>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Alle Sets und das Zubehör sind aktuell für alle Buchungen verfügbar.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {alerts.map((a) => {
              const period = a.rental_from
                ? `${fmtDate(a.rental_from)}${a.rental_to && a.rental_to !== a.rental_from ? ` – ${fmtDate(a.rental_to)}` : ''}`
                : null;
              const isResolved = !!a.resolved_at;
              return (
                <div
                  key={a.id}
                  style={{
                    background: '#111827',
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${isResolved ? '#1e293b' : '#7f1d1d'}`,
                    opacity: isResolved ? 0.65 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 999,
                          background: TYPE_COLOR[a.alert_type],
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 700,
                        }}>
                          {TYPE_LABEL[a.alert_type]}
                        </span>
                        {a.occurrence_count > 1 && (
                          <span style={{ fontSize: 11, color: '#fda4af' }}>
                            {a.occurrence_count}× gemeldet
                          </span>
                        )}
                        {isResolved && (
                          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>
                            ✓ Erledigt {fmtDateTime(a.resolved_at!)}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                        {a.product_name ?? a.set_name ?? a.accessory_name ?? '—'}
                      </p>
                      <div style={{ marginTop: 6, fontSize: 13, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {a.set_name && a.product_name && <span>Set: {a.set_name}</span>}
                        {a.accessory_name && (a.product_name || a.set_name) && <span>Zubehör: {a.accessory_name}</span>}
                        {period && <span>Zeitraum: {period}</span>}
                        {a.customer_email && <span>Kunde: {a.customer_email}</span>}
                        <span style={{ color: '#64748b' }}>Erstmals: {fmtDateTime(a.first_seen_at)} · Zuletzt: {fmtDateTime(a.last_seen_at)}</span>
                      </div>
                      <p style={{ margin: '10px 0 0', fontSize: 12, color: '#fca5a5', fontStyle: 'italic' }}>
                        {TYPE_HINT[a.alert_type]}
                      </p>
                      {a.resolved_note && (
                        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#86efac' }}>
                          Lösungs-Notiz: {a.resolved_note}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {!isResolved ? (
                        <button
                          type="button"
                          onClick={() => handleResolve(a.id)}
                          disabled={busy === a.id}
                          style={{
                            padding: '6px 12px',
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: busy === a.id ? 'wait' : 'pointer',
                            opacity: busy === a.id ? 0.6 : 1,
                          }}
                        >
                          Als erledigt
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleReopen(a.id)}
                          disabled={busy === a.id}
                          style={{
                            padding: '6px 12px',
                            background: '#475569',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: busy === a.id ? 'wait' : 'pointer',
                            opacity: busy === a.id ? 0.6 : 1,
                          }}
                        >
                          Wiedereröffnen
                        </button>
                      )}
                      {a.alert_type === 'no_basic_set' && (
                        <a
                          href="/admin/sets"
                          style={{
                            padding: '6px 12px',
                            background: '#0891b2',
                            color: '#fff',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            textDecoration: 'none',
                            textAlign: 'center',
                          }}
                        >
                          Sets öffnen
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

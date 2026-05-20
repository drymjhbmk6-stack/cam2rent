'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

/**
 * Sticky-Banner ganz oben im Admin-Dashboard. Sichtbar, sobald es offene
 * Verfuegbarkeits-Alerts gibt (Basis-Set fehlt / ausgebucht / Zubehoer
 * ausgebucht). Pollt alle 60s, pausiert bei Tab-Hidden, mit Backoff bei
 * API-Fehlern (analog NotificationDropdown).
 */

type Alert = {
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
  occurrence_count: number;
  last_seen_at: string;
};

const TYPE_LABEL: Record<Alert['alert_type'], string> = {
  no_basic_set: 'Basis-Set fehlt',
  basic_set_unavailable: 'Basis-Set ausgebucht',
  set_unavailable: 'Set ausgebucht',
  accessory_unavailable: 'Zubehör ausgebucht',
};

const TYPE_COLOR: Record<Alert['alert_type'], string> = {
  no_basic_set: '#ef4444',
  basic_set_unavailable: '#f97316',
  set_unavailable: '#f59e0b',
  accessory_unavailable: '#eab308',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  // YYYY-MM-DD → DD.MM.YYYY
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export default function AvailabilityAlertsBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [backoffMs, setBackoffMs] = useState(60_000);

  const load = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch('/api/admin/availability-alerts?open=true', { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        setBackoffMs((b) => Math.min(b * 2, 300_000));
        return;
      }
      const json = await res.json();
      setAlerts(Array.isArray(json.alerts) ? json.alerts : []);
      setBackoffMs(60_000);
    } catch {
      setBackoffMs((b) => Math.min(b * 2, 300_000));
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (document.visibilityState === 'visible') load();
      timer = setTimeout(tick, backoffMs);
    };
    load();
    timer = setTimeout(tick, backoffMs);
    return () => { if (timer) clearTimeout(timer); };
  }, [load, backoffMs]);

  if (alerts.length === 0) return null;

  const topCount = alerts.length;
  const visible = expanded ? alerts : alerts.slice(0, 3);

  return (
    <div style={{
      background: '#7f1d1d',
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
      border: '1px solid #b91c1c',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(239,68,68,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width={18} height={18} fill="none" stroke="#fecaca" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ margin: 0, color: '#fecaca', fontWeight: 700, fontSize: 15 }}>
            Verfügbarkeits-Probleme — {topCount} {topCount === 1 ? 'offener Fall' : 'offene Fälle'}
          </p>
          <p style={{ margin: '2px 0 0', color: '#fca5a5', fontSize: 12 }}>
            Kunden konnten Buchungen nicht abschließen. Bitte prüfen.
          </p>
        </div>
        <Link
          href="/admin/verfuegbarkeit-alerts"
          style={{
            padding: '8px 14px', background: '#fecaca', color: '#7f1d1d',
            borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}
        >
          Alle ansehen →
        </Link>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {visible.map((a) => {
          const period = a.rental_from
            ? `${fmtDate(a.rental_from)}${a.rental_to && a.rental_to !== a.rental_from ? ` – ${fmtDate(a.rental_to)}` : ''}`
            : '';
          return (
            <div key={a.id} style={{
              background: 'rgba(0,0,0,0.25)',
              borderRadius: 8,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}>
              <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 999,
                background: TYPE_COLOR[a.alert_type],
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {TYPE_LABEL[a.alert_type]}
              </span>
              <span style={{ color: '#fecaca', fontSize: 13, fontWeight: 600 }}>
                {a.product_name ?? a.set_name ?? a.accessory_name ?? '—'}
              </span>
              {period && (
                <span style={{ color: '#fca5a5', fontSize: 12 }}>
                  · {period}
                </span>
              )}
              {a.occurrence_count > 1 && (
                <span style={{ color: '#fda4af', fontSize: 11 }}>
                  · {a.occurrence_count}× gemeldet
                </span>
              )}
            </div>
          );
        })}
      </div>

      {alerts.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 8,
            background: 'transparent',
            border: 'none',
            color: '#fecaca',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          {expanded ? '↑ Weniger anzeigen' : `↓ ${alerts.length - 3} weitere anzeigen`}
        </button>
      )}
    </div>
  );
}

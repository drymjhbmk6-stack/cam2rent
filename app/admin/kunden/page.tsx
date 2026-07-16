'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  address_city: string;
  verification_status: 'none' | 'pending' | 'verified' | 'rejected';
  verified_at: string | null;
  blacklisted: boolean;
  blacklist_reason: string;
  blacklisted_at: string | null;
  is_tester: boolean;
  special_discount_percent: number | null;
  special_discount_valid_until: string | null;
  deactivated_at: string | null;
  booking_count: number;
  created_at: string;
  last_login: string | null;
}

// "vor X …" — wie lange der letzte Login her ist
function relativeAgo(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 60) return 'gerade eben';
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.floor(std / 24);
  if (tage < 30) return `vor ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
  const monate = Math.floor(tage / 30);
  if (monate < 12) return `vor ${monate} ${monate === 1 ? 'Monat' : 'Monaten'}`;
  const jahre = Math.floor(tage / 365);
  return `vor ${jahre} ${jahre === 1 ? 'Jahr' : 'Jahren'}`;
}

// Farbton je nach Inaktivität (frisch = grün, alt = rot)
function agoColor(iso: string | null): string {
  if (!iso) return '#475569';
  const tage = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (tage < 7) return '#10b981';
  if (tage < 30) return '#f59e0b';
  return '#ef4444';
}

// Vollen Namen in Nachname + Vorname zerlegen (letztes Wort = Nachname)
function splitName(full: string): { last: string; first: string } {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { last: '', first: '' };
  if (parts.length === 1) return { last: parts[0], first: '' };
  return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' ') };
}

// Anzeige "Nachname, Vorname" (ohne Nachname → Vorname/Name pur)
function displayName(full: string): string {
  const { last, first } = splitName(full);
  if (!last) return '';
  return first ? `${last}, ${first}` : last;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  none: { label: 'Nicht verifiziert', color: '#94a3b8', bg: '#94a3b814' },
  pending: { label: 'Ausstehend', color: '#f59e0b', bg: '#f59e0b14' },
  verified: { label: 'Verifiziert', color: '#10b981', bg: '#10b98114' },
  rejected: { label: 'Abgelehnt', color: '#ef4444', bg: '#ef444414' },
};

const FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'active', label: 'Aktive' },
  { value: 'blacklisted', label: 'Gesperrte' },
  { value: 'inactive', label: 'Inaktiv' },
];

export default function KundenPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [letter, setLetter] = useState('');
  const [resettingId, setResettingId] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const params =
      filter === 'blacklisted' ? '?status=blacklisted'
      : filter === 'inactive' ? '?status=inactive'
      : '';
    const res = await fetch(`/api/admin/kunden${params}`);
    const data = await res.json();
    setCustomers(data.customers || []);
    setLoading(false);
  }, [filter]);

  // Inaktives Konto wieder aktivieren (leert deactivated_at).
  const handleReactivate = useCallback(async (c: Customer) => {
    if (!confirm(`Konto von ${c.full_name || c.email} wieder aktivieren?`)) return;
    setResettingId(c.id);
    try {
      const res = await fetch('/api/admin/kunden/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: c.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Reaktivierung fehlgeschlagen.');
        return;
      }
      // Aus der Inaktiv-Liste entfernen (bzw. neu laden).
      setCustomers((prev) => prev.filter((x) => x.id !== c.id));
    } finally {
      setResettingId(null);
    }
  }, []);

  // Tester-Konto zuruecksetzen → E-Mail freigeben + Profil/Ausweis-Fotos
  // loeschen, damit man sich mit derselben E-Mail neu registrieren kann.
  const handleResetTester = useCallback(async (c: Customer) => {
    const ok = window.confirm(
      `Test-Konto „${c.full_name || c.email}" zurücksetzen?\n\n` +
      `Das Konto wird gelöscht und die E-Mail ${c.email} wieder freigegeben — ` +
      `man kann sich damit danach neu registrieren.\n\n` +
      `Buchungen bleiben in der Datenbank, tauchen unter dem neuen Konto aber nicht mehr auf.`,
    );
    if (!ok) return;
    setResettingId(c.id);
    try {
      const res = await fetch('/api/admin/kunden/reset-tester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: c.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Zurücksetzen fehlgeschlagen.');
        return;
      }
      await fetchCustomers();
    } catch {
      alert('Netzwerkfehler beim Zurücksetzen.');
    } finally {
      setResettingId(null);
    }
  }, [fetchCustomers]);

  // Recovery: eine bereits halb-gelöschte Test-E-Mail per Adresse freigeben
  // (Profil schon weg, Auth-User hängt noch) → erscheint nicht mehr in der Liste.
  const handleFreeEmail = useCallback(async () => {
    const email = window.prompt(
      'Test-E-Mail freigeben (Recovery)\n\n' +
      'E-Mail-Adresse eingeben, die für eine Neuregistrierung freigegeben werden soll:',
    );
    if (!email || !email.trim()) return;
    try {
      const res = await fetch('/api/admin/kunden/reset-tester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Freigeben fehlgeschlagen.');
        return;
      }
      alert(`E-Mail freigegeben. Es kann jetzt eine Neuregistrierung mit „${email.trim()}" erfolgen.`);
      await fetchCustomers();
    } catch {
      alert('Netzwerkfehler beim Freigeben.');
    }
  }, [fetchCustomers]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Anfangsbuchstabe für die A–Z-Reiter (Nachname, sonst E-Mail; nicht A–Z → '#')
  const firstLetter = (c: Customer): string => {
    const base = (splitName(c.full_name).last || c.email || '').trim();
    const ch = base.charAt(0).toUpperCase();
    return ch >= 'A' && ch <= 'Z' ? ch : '#';
  };

  // Status + Suche, dann alphabetisch nach Nachname (leere Namen ans Ende)
  const base = customers
    .filter((c) => {
      if (filter === 'active' && c.blacklisted) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (c.full_name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.address_city || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const a1 = splitName(a.full_name);
      const b1 = splitName(b.full_name);
      if (!a1.last && !b1.last) return (a.email || '').localeCompare(b.email || '', 'de');
      if (!a1.last) return 1;
      if (!b1.last) return -1;
      const byLast = a1.last.localeCompare(b1.last, 'de', { sensitivity: 'base' });
      if (byLast !== 0) return byLast;
      return a1.first.localeCompare(b1.first, 'de', { sensitivity: 'base' });
    });

  // Vorhandene Anfangsbuchstaben (für aktive/disabled Reiter)
  const availableLetters = new Set(base.map(firstLetter));

  // Buchstaben-Filter greift nur ohne aktive Suche
  const filtered = letter && !search.trim()
    ? base.filter((c) => firstLetter(c) === letter)
    : base;

  const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

  return (
    <div style={{ padding: '20px 16px' }}>
      <AdminBackLink label="Zurück" />
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', margin: 0 }}>
            Kunden
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 0 }}>
            {filtered.length} Kunden {search ? 'gefunden' : 'insgesamt'}
          </p>
        </div>
        <button
          onClick={handleFreeEmail}
          title="Eine bereits gelöschte Test-E-Mail für eine Neuregistrierung freigeben"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: '#94a3b8',
            background: '#111827',
            border: '1px solid #1e293b',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          🔑 Test-E-Mail freigeben
        </button>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 250px', maxWidth: 400 }}>
          <svg
            width="16" height="16" fill="none" stroke="#64748b" viewBox="0 0 24 24"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, E-Mail, Stadt suchen..."
            style={{
              width: '100%',
              padding: '10px 12px 10px 38px',
              background: '#111827',
              border: '1px solid #1e293b',
              borderRadius: 8,
              color: '#e2e8f0',
              fontSize: 14,
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: filter === f.value ? '#1e293b' : 'transparent',
                color: filter === f.value ? '#22d3ee' : '#64748b',
                transition: 'all 0.2s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* A–Z-Reiter (bei aktiver Suche ausgeblendet) */}
      {!search.trim() && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            marginBottom: 20,
          }}
        >
          <button
            onClick={() => setLetter('')}
            style={{
              minWidth: 34,
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: letter === '' ? '#06b6d4' : '#111827',
              color: letter === '' ? '#0a0f1e' : '#94a3b8',
            }}
          >
            Alle
          </button>
          {ALPHABET.map((l) => {
            const has = availableLetters.has(l);
            const active = letter === l;
            return (
              <button
                key={l}
                onClick={() => has && setLetter(active ? '' : l)}
                disabled={!has}
                style={{
                  minWidth: 34,
                  padding: '6px 0',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  border: 'none',
                  cursor: has ? 'pointer' : 'default',
                  background: active ? '#06b6d4' : has ? '#111827' : 'transparent',
                  color: active ? '#0a0f1e' : has ? '#e2e8f0' : '#334155',
                }}
              >
                {l}
              </button>
            );
          })}
        </div>
      )}

      {/* Tabelle */}
      <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Laden...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Keine Kunden gefunden.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1040, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  {['Name', 'E-Mail', 'Stadt', 'Buchungen', 'Verifizierung', 'Status', 'Letzter Login', 'Login her'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: '#64748b',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const st = STATUS_LABELS[c.verification_status] || STATUS_LABELS.none;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/admin/kunden/${c.id}`)}
                      style={{
                        borderBottom: i < filtered.length - 1 ? '1px solid #1e293b' : 'none',
                        cursor: 'pointer',
                        animation: `fadeIn 0.3s ease ${i * 0.03}s both`,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1e293b44'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                        {displayName(c.full_name) || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8' }}>
                        {c.email}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8' }}>
                        {c.address_city || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                        {c.booking_count}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            color: st.color,
                            background: st.bg,
                          }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {c.blacklisted ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#ef4444',
                                background: '#ef444414',
                              }}
                            >
                              Gesperrt
                            </span>
                          ) : c.deactivated_at ? (
                            <span
                              title={`Inaktiv seit ${fmtDateTime(c.deactivated_at)}`}
                              style={{
                                display: 'inline-block',
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#94a3b8',
                                background: '#94a3b814',
                                border: '1px solid #94a3b833',
                              }}
                            >
                              Inaktiv
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#10b981',
                                background: '#10b98114',
                              }}
                            >
                              Aktiv
                            </span>
                          )}
                          {c.deactivated_at && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReactivate(c); }}
                              disabled={resettingId === c.id}
                              title="Konto wieder aktivieren (erscheint wieder in der aktiven Liste)"
                              style={{
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#10b981',
                                background: '#10b98114',
                                border: '1px solid #10b98144',
                                cursor: resettingId === c.id ? 'default' : 'pointer',
                                opacity: resettingId === c.id ? 0.6 : 1,
                              }}
                            >
                              {resettingId === c.id ? 'Aktiviere…' : '↻ Reaktivieren'}
                            </button>
                          )}
                          {c.is_tester && (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#ec4899',
                                background: '#ec489914',
                                border: '1px solid #ec489933',
                              }}
                            >
                              Tester
                            </span>
                          )}
                          {c.special_discount_percent != null && c.special_discount_percent > 0 &&
                            (!c.special_discount_valid_until ||
                              c.special_discount_valid_until >=
                                new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })) && (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#818cf8',
                                background: '#6366f114',
                                border: '1px solid #6366f133',
                              }}
                              title="Sonderkondition (individueller Rabatt)"
                            >
                              Sonderkondition {c.special_discount_percent}%
                            </span>
                          )}
                          {c.is_tester && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResetTester(c); }}
                              disabled={resettingId === c.id}
                              title="Konto löschen, damit man sich mit dieser E-Mail neu registrieren kann"
                              style={{
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#f59e0b',
                                background: '#f59e0b14',
                                border: '1px solid #f59e0b44',
                                cursor: resettingId === c.id ? 'default' : 'pointer',
                                opacity: resettingId === c.id ? 0.6 : 1,
                              }}
                            >
                              {resettingId === c.id ? 'Setzt zurück…' : '↻ Zurücksetzen'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {c.last_login ? fmtDateTime(c.last_login) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: agoColor(c.last_login), whiteSpace: 'nowrap' }}>
                        {relativeAgo(c.last_login)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

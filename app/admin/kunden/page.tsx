'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
  booking_count: number;
  created_at: string;
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
];

export default function KundenPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const params = filter === 'blacklisted' ? '?status=blacklisted' : '';
    const res = await fetch(`/api/admin/kunden${params}`);
    const data = await res.json();
    setCustomers(data.customers || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // Client-side filtering
  const filtered = customers.filter((c) => {
    // Filter: active = not blacklisted
    if (filter === 'active' && c.blacklisted) return false;
    // Search
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
  });

  return (
    <div style={{ padding: '20px 16px' }}>
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

      {/* Tabelle */}
      <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Laden...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Keine Kunden gefunden.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  {['Name', 'E-Mail', 'Stadt', 'Buchungen', 'Verifizierung', 'Status', 'Registriert'].map((h) => (
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
                        {c.full_name || '—'}
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
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>
                        {formatDate(c.created_at)}
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

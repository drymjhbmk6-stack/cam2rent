'use client';

import { useState, useEffect, useCallback } from 'react';

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
  { value: 'pending', label: 'Ausstehend' },
  { value: 'verified', label: 'Verifiziert' },
  { value: 'blacklisted', label: 'Gesperrt' },
];

export default function KundenPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [idImages, setIdImages] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [loadingImages, setLoadingImages] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const params = filter ? `?status=${filter}` : '';
    const res = await fetch(`/api/admin/kunden${params}`);
    const data = await res.json();
    setCustomers(data.customers || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  async function openDetail(customer: Customer) {
    setSelectedCustomer(customer);
    setBlacklistReason(customer.blacklist_reason || '');
    setIdImages({ front: null, back: null });

    if (customer.verification_status === 'pending') {
      setLoadingImages(true);
      try {
        const [frontRes, backRes] = await Promise.all([
          fetch(`/api/admin/kunden/id-document?userId=${customer.id}&side=front`),
          fetch(`/api/admin/kunden/id-document?userId=${customer.id}&side=back`),
        ]);
        const frontData = await frontRes.json();
        const backData = await backRes.json();
        setIdImages({
          front: frontData.url || null,
          back: backData.url || null,
        });
      } catch {
        // Bilder nicht verfügbar
      }
      setLoadingImages(false);
    }
  }

  async function handleVerify(action: 'verify' | 'reject') {
    if (!selectedCustomer) return;
    setActionLoading(true);
    await fetch('/api/admin/kunden/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedCustomer.id, action }),
    });
    setActionLoading(false);
    setSelectedCustomer(null);
    fetchCustomers();
  }

  async function handleBlacklist(blacklisted: boolean) {
    if (!selectedCustomer) return;
    setActionLoading(true);
    await fetch('/api/admin/kunden/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selectedCustomer.id,
        blacklisted,
        reason: blacklistReason,
      }),
    });
    setActionLoading(false);
    setSelectedCustomer(null);
    fetchCustomers();
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  return (
    <div style={{ padding: '20px 16px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-xl" style={{ color: '#e2e8f0' }}>
            Kunden
          </h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>
            {customers.length} Kunden insgesamt
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all"
            style={
              filter === f.value
                ? { background: '#1e293b', color: '#22d3ee' }
                : { background: 'transparent', color: '#64748b' }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabelle */}
      <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden' }}>
        {loading ? (
          <div className="p-8 text-center" style={{ color: '#64748b' }}>Laden…</div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center" style={{ color: '#64748b' }}>Keine Kunden gefunden.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  {['Name', 'E-Mail', 'Verifizierung', 'Buchungen', 'Status', 'Registriert'].map((h) => (
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
                {customers.map((c, i) => {
                  const st = STATUS_LABELS[c.verification_status] || STATUS_LABELS.none;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => openDetail(c)}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderBottom: i < customers.length - 1 ? '1px solid #1e293b' : 'none',
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
                      <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                        {c.booking_count}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {c.blacklisted && (
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

      {/* Detail Modal */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setSelectedCustomer(null)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto"
            style={{
              background: '#111827',
              borderRadius: 16,
              border: '1px solid #1e293b',
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-heading font-bold text-lg" style={{ color: '#e2e8f0' }}>
                  {selectedCustomer.full_name || 'Unbekannt'}
                </h2>
                <p className="text-sm" style={{ color: '#64748b' }}>
                  {selectedCustomer.email}
                </p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                style={{ color: '#64748b', padding: 4 }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Telefon</div>
                <div style={{ fontSize: 14, color: '#e2e8f0' }}>{selectedCustomer.phone || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Stadt</div>
                <div style={{ fontSize: 14, color: '#e2e8f0' }}>{selectedCustomer.address_city || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Buchungen</div>
                <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 700 }}>{selectedCustomer.booking_count}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Registriert</div>
                <div style={{ fontSize: 14, color: '#e2e8f0' }}>{formatDate(selectedCustomer.created_at)}</div>
              </div>
            </div>

            {/* Verifizierung */}
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 20, marginBottom: 20 }}>
              <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#e2e8f0' }}>
                Identitätsverifizierung
              </h3>

              {selectedCustomer.verification_status === 'pending' && (
                <>
                  {/* Ausweisbilder */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {loadingImages ? (
                      <>
                        <div style={{ height: 160, background: '#1e293b', borderRadius: 8 }} className="animate-pulse" />
                        <div style={{ height: 160, background: '#1e293b', borderRadius: 8 }} className="animate-pulse" />
                      </>
                    ) : (
                      <>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>VORDERSEITE</div>
                          {idImages.front ? (
                            <img src={idImages.front} alt="Vorderseite" style={{ width: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'contain', background: '#0a0f1e' }} />
                          ) : (
                            <div style={{ height: 120, background: '#1e293b', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>
                              Nicht verfügbar
                            </div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>RÜCKSEITE</div>
                          {idImages.back ? (
                            <img src={idImages.back} alt="Rückseite" style={{ width: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'contain', background: '#0a0f1e' }} />
                          ) : (
                            <div style={{ height: 120, background: '#1e293b', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>
                              Nicht verfügbar
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleVerify('verify')}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                      style={{ background: '#10b981', color: 'white' }}
                    >
                      Verifizieren
                    </button>
                    <button
                      onClick={() => handleVerify('reject')}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                      style={{ background: '#ef4444', color: 'white' }}
                    >
                      Ablehnen
                    </button>
                  </div>
                </>
              )}

              {selectedCustomer.verification_status === 'verified' && (
                <div className="flex items-center gap-2" style={{ color: '#10b981', fontSize: 14 }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Verifiziert am {formatDate(selectedCustomer.verified_at)}
                </div>
              )}

              {selectedCustomer.verification_status === 'rejected' && (
                <div style={{ color: '#ef4444', fontSize: 14 }}>Abgelehnt</div>
              )}

              {selectedCustomer.verification_status === 'none' && (
                <div style={{ color: '#64748b', fontSize: 14 }}>Noch nicht eingereicht</div>
              )}
            </div>

            {/* Blacklist */}
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 20 }}>
              <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#e2e8f0' }}>
                Kundenstatus
              </h3>

              {selectedCustomer.blacklisted ? (
                <div>
                  <div className="flex items-center gap-2 mb-3" style={{ color: '#ef4444', fontSize: 14 }}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    Gesperrt seit {formatDate(selectedCustomer.blacklisted_at)}
                  </div>
                  {selectedCustomer.blacklist_reason && (
                    <p className="mb-3" style={{ fontSize: 13, color: '#94a3b8' }}>
                      Grund: {selectedCustomer.blacklist_reason}
                    </p>
                  )}
                  <button
                    onClick={() => handleBlacklist(false)}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{ background: '#1e293b', color: '#10b981' }}
                  >
                    Entsperren
                  </button>
                </div>
              ) : (
                <div>
                  <textarea
                    value={blacklistReason}
                    onChange={(e) => setBlacklistReason(e.target.value)}
                    placeholder="Grund für die Sperrung (optional)…"
                    rows={2}
                    className="w-full mb-3 text-sm"
                    style={{
                      background: '#0a0f1e',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#e2e8f0',
                      resize: 'none',
                    }}
                  />
                  <button
                    onClick={() => handleBlacklist(true)}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{ background: '#ef4444', color: 'white' }}
                  >
                    Kunde sperren
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

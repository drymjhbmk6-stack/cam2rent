'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDate, fmtDateTime, formatCurrency } from '@/lib/format-utils';

/* ───── Types ───── */
interface CustomerProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  address_street: string;
  address_zip: string;
  address_city: string;
  verification_status: string;
  verified_at: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  blacklisted: boolean;
  blacklist_reason: string;
  blacklisted_at: string | null;
  created_at: string;
  anonymized: boolean;
  deleted_at: string | null;
}

interface Stats {
  totalBookings: number;
  totalRevenue: number;
  avgBookingValue: number;
  lastBooking: string | null;
}

interface Booking {
  id: string;
  product_name: string;
  rental_from: string;
  rental_to: string;
  price_total: number;
  status: string;
  created_at: string;
}

interface Damage {
  id: string;
  booking_id: string;
  product_name: string;
  description: string;
  status: string;
  damage_amount: number;
  created_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_type: string;
  body: string;
  read: boolean;
  created_at: string;
}

interface Conversation {
  id: string;
  subject: string;
  booking_id: string;
  created_at: string;
  closed: boolean;
  messages: Message[];
}

interface Review {
  id: string;
  product_name?: string;
  product_id?: string;
  rating: number;
  title: string;
  text: string;
  created_at: string;
}

interface Note {
  id: string;
  customer_id: string;
  content: string;
  created_at: string;
}

/* ───── Constants ───── */
const TABS = [
  { key: 'profil', label: 'Profil' },
  { key: 'buchungen', label: 'Buchungen' },
  { key: 'schaeden', label: 'Schäden' },
  { key: 'nachrichten', label: 'Nachrichten' },
  { key: 'bewertungen', label: 'Bewertungen' },
  { key: 'notizen', label: 'Notizen' },
];

const BOOKING_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Ausstehend', color: '#f59e0b', bg: '#f59e0b14' },
  confirmed: { label: 'Bestätigt', color: '#06b6d4', bg: '#06b6d414' },
  shipped: { label: 'Versendet', color: '#8b5cf6', bg: '#8b5cf614' },
  active: { label: 'Aktiv', color: '#10b981', bg: '#10b98114' },
  returned: { label: 'Zurückgegeben', color: '#64748b', bg: '#64748b14' },
  completed: { label: 'Abgeschlossen', color: '#10b981', bg: '#10b98114' },
  cancelled: { label: 'Storniert', color: '#ef4444', bg: '#ef444414' },
  damaged: { label: 'Beschädigt', color: '#ef4444', bg: '#ef444414' },
};

const DAMAGE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Offen', color: '#f59e0b', bg: '#f59e0b14' },
  confirmed: { label: 'Bestätigt', color: '#ef4444', bg: '#ef444414' },
  resolved: { label: 'Gelöst', color: '#10b981', bg: '#10b98114' },
};

/* ───── Helpers ───── */
function retentionDate(createdAt: string) {
  const d = new Date(createdAt);
  d.setFullYear(d.getFullYear() + 10);
  return fmtDate(d.toISOString());
}

/* ───── Component ───── */
export default function KundenDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [damages, setDamages] = useState<Damage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeTab, setActiveTab] = useState('profil');
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [idFrontSignedUrl, setIdFrontSignedUrl] = useState<string | null>(null);
  const [idBackSignedUrl, setIdBackSignedUrl] = useState<string | null>(null);
  const [idImagesLoading, setIdImagesLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customer/${customerId}`);
      const data = await res.json();
      if (data.error) {
        console.error(data.error);
        setLoading(false);
        return;
      }
      setCustomer(data.customer);
      setStats(data.stats);
      setBookings(data.bookings || []);
      setDamages(data.damages || []);
      setConversations(data.conversations || []);
      setReviews(data.reviews || []);
    } catch (err) {
      console.error('Fehler beim Laden:', err);
    }
    setLoading(false);
  }, [customerId]);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/customer-notes?customerId=${customerId}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {
      // ignore
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
    fetchNotes();
  }, [fetchData, fetchNotes]);

  // Ausweis-Bilder laden wenn Customer geladen ist
  useEffect(() => {
    if (!customer?.id_front_url && !customer?.id_back_url) return;

    async function loadIdImages() {
      setIdImagesLoading(true);
      try {
        if (customer?.id_front_url) {
          const res = await fetch(`/api/admin/id-document-url?path=${encodeURIComponent(customer.id_front_url)}`);
          const data = await res.json();
          if (data.url) setIdFrontSignedUrl(data.url);
        }
        if (customer?.id_back_url) {
          const res = await fetch(`/api/admin/id-document-url?path=${encodeURIComponent(customer.id_back_url)}`);
          const data = await res.json();
          if (data.url) setIdBackSignedUrl(data.url);
        }
      } catch {
        // Bilder konnten nicht geladen werden
      }
      setIdImagesLoading(false);
    }

    loadIdImages();
  }, [customer?.id_front_url, customer?.id_back_url]);

  async function handleVerify(status: 'verified' | 'rejected') {
    setVerifyLoading(true);
    await fetch('/api/admin/verify-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, status }),
    });
    setVerifyLoading(false);
    fetchData();
  }

  async function handleBlock(blocked: boolean) {
    setBlockLoading(true);
    await fetch('/api/admin/kunden/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: customerId,
        blacklisted: blocked,
        reason: blacklistReason,
      }),
    });
    setBlockLoading(false);
    setBlacklistReason('');
    fetchData();
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      await fetch('/api/admin/customer-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, content: noteText }),
      });
      setNoteText('');
      fetchNotes();
    } catch {
      // ignore
    }
    setNoteSaving(false);
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
        Kundendaten werden geladen...
      </div>
    );
  }

  if (!customer) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
        Kunde nicht gefunden.
        <div style={{ marginTop: 16 }}>
          <AdminBackLink href="/admin/kunden" label="Zurück zu Kunden" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1100, margin: '0 auto' }}>
      {/* ───── Header ───── */}
      <div style={{ marginBottom: 24 }}>
        <AdminBackLink href="/admin/kunden" label="Zurück zu Kunden" />

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', margin: 0 }}>
            {customer.full_name || 'Unbekannt'}
          </h1>
          <span style={{ fontSize: 13, color: '#64748b' }}>{customer.email}</span>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            {customer.blacklisted ? (
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 6,
                fontSize: 12, fontWeight: 700, color: '#ef4444', background: '#ef444414',
              }}>
                Gesperrt
              </span>
            ) : (
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 6,
                fontSize: 12, fontWeight: 700, color: '#10b981', background: '#10b98114',
              }}>
                Aktiv
              </span>
            )}
            {customer.verification_status === 'verified' && (
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 6,
                fontSize: 12, fontWeight: 700, color: '#06b6d4', background: '#06b6d414',
              }}>
                Verifiziert
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ───── Tab Navigation ───── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#0a0f1e',
        borderBottom: '1px solid #1e293b',
        marginBottom: 24,
        display: 'flex',
        gap: 0,
        overflowX: 'auto',
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 600,
              color: activeTab === tab.key ? '#06b6d4' : '#64748b',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #06b6d4' : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ───── Tab: Profil ───── */}
      {activeTab === 'profil' && (
        <div>
          {/* Kundendaten */}
          <div style={{
            background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
            padding: 24, marginBottom: 20,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 20, marginTop: 0 }}>
              Kundendaten
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
              <InfoField label="Name" value={customer.full_name || '—'} />
              <InfoField label="E-Mail" value={customer.email || '—'} />
              <InfoField label="Telefon" value={customer.phone || '—'} />
              <InfoField label="Adresse" value={
                [customer.address_street, `${customer.address_zip} ${customer.address_city}`]
                  .filter((s) => s.trim()).join(', ') || '—'
              } />
              <InfoField label="Registriert am" value={fmtDate(customer.created_at)} />
              <InfoField label="Verifizierung" value={
                customer.verification_status === 'verified' ? `Verifiziert am ${customer.verified_at ? fmtDate(customer.verified_at) : '—'}`
                  : customer.verification_status === 'pending' ? 'Ausstehend'
                  : customer.verification_status === 'rejected' ? 'Abgelehnt'
                  : 'Nicht verifiziert'
              } />
            </div>
          </div>

          {/* Ausweis-Verifizierung */}
          {(customer.id_front_url || customer.id_back_url || customer.verification_status === 'pending') && (
            <div style={{
              background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
              padding: 24, marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                  Ausweis-Verifizierung
                </h2>
                <span style={{
                  display: 'inline-block', padding: '4px 12px', borderRadius: 6,
                  fontSize: 12, fontWeight: 700,
                  color: customer.verification_status === 'verified' ? '#10b981'
                    : customer.verification_status === 'pending' ? '#f59e0b'
                    : customer.verification_status === 'rejected' ? '#ef4444'
                    : '#64748b',
                  background: customer.verification_status === 'verified' ? '#10b98114'
                    : customer.verification_status === 'pending' ? '#f59e0b14'
                    : customer.verification_status === 'rejected' ? '#ef444414'
                    : '#64748b14',
                }}>
                  {customer.verification_status === 'verified' ? 'Verifiziert'
                    : customer.verification_status === 'pending' ? 'Ausstehend'
                    : customer.verification_status === 'rejected' ? 'Abgelehnt'
                    : 'Nicht verifiziert'}
                </span>
              </div>

              {/* Ausweis-Bilder */}
              {idImagesLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>
                  Bilder werden geladen...
                </div>
              ) : (idFrontSignedUrl || idBackSignedUrl) ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  {/* Vorderseite */}
                  <div>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
                    }}>
                      Vorderseite
                    </div>
                    {idFrontSignedUrl ? (
                      <a href={idFrontSignedUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={idFrontSignedUrl}
                          alt="Ausweis Vorderseite"
                          style={{
                            width: '100%', borderRadius: 8, border: '1px solid #1e293b',
                            cursor: 'pointer', maxHeight: 300, objectFit: 'contain',
                            background: '#0a0f1e',
                          }}
                        />
                      </a>
                    ) : (
                      <div style={{
                        padding: 32, textAlign: 'center', color: '#64748b',
                        background: '#0a0f1e', borderRadius: 8, border: '1px solid #1e293b',
                      }}>
                        Nicht hochgeladen
                      </div>
                    )}
                  </div>

                  {/* Rückseite */}
                  <div>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
                    }}>
                      Rückseite
                    </div>
                    {idBackSignedUrl ? (
                      <a href={idBackSignedUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={idBackSignedUrl}
                          alt="Ausweis Rückseite"
                          style={{
                            width: '100%', borderRadius: 8, border: '1px solid #1e293b',
                            cursor: 'pointer', maxHeight: 300, objectFit: 'contain',
                            background: '#0a0f1e',
                          }}
                        />
                      </a>
                    ) : (
                      <div style={{
                        padding: 32, textAlign: 'center', color: '#64748b',
                        background: '#0a0f1e', borderRadius: 8, border: '1px solid #1e293b',
                      }}>
                        Nicht hochgeladen
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: 20, textAlign: 'center', color: '#64748b', marginBottom: 20,
                  background: '#0a0f1e', borderRadius: 8, border: '1px solid #1e293b',
                }}>
                  Keine Ausweisbilder hochgeladen.
                </div>
              )}

              {/* Verifizierungs-Buttons */}
              {customer.verification_status !== 'verified' && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => handleVerify('verified')}
                    disabled={verifyLoading}
                    style={{
                      padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                      background: '#10b981', color: 'white', border: 'none', cursor: 'pointer',
                      opacity: verifyLoading ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Verifizieren
                  </button>
                  <button
                    onClick={() => handleVerify('rejected')}
                    disabled={verifyLoading}
                    style={{
                      padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                      background: '#1e293b', color: '#ef4444', border: '1px solid #ef444440', cursor: 'pointer',
                      opacity: verifyLoading ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Ablehnen
                  </button>
                </div>
              )}

              {customer.verification_status === 'verified' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', fontSize: 14 }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Verifiziert am {customer.verified_at ? fmtDate(customer.verified_at) : '—'}
                </div>
              )}
            </div>
          )}

          {/* Stats Cards */}
          {stats && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 16, marginBottom: 20,
            }}>
              <StatCard label="Buchungen gesamt" value={String(stats.totalBookings)} />
              <StatCard label="Gesamtumsatz" value={formatCurrency(stats.totalRevenue)} />
              <StatCard label="Durchschn. Buchungswert" value={formatCurrency(stats.avgBookingValue)} />
              <StatCard label="Letzte Buchung" value={stats.lastBooking ? fmtDate(stats.lastBooking) : '—'} />
            </div>
          )}

          {/* Aufbewahrung */}
          <div style={{
            background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
            padding: 20, marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Daten werden bis {retentionDate(customer.created_at)} aufbewahrt (10 Jahre ab Registrierung)
            </div>
          </div>

          {/* Sperren / Entsperren */}
          <div style={{
            background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
            padding: 24,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, marginTop: 0 }}>
              Kundenstatus
            </h2>
            {customer.blacklisted ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#ef4444', fontSize: 14 }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Gesperrt seit {customer.blacklisted_at ? fmtDate(customer.blacklisted_at) : '—'}
                </div>
                {customer.blacklist_reason && (
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
                    Grund: {customer.blacklist_reason}
                  </p>
                )}
                <button
                  onClick={() => handleBlock(false)}
                  disabled={blockLoading}
                  style={{
                    padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                    background: '#1e293b', color: '#10b981', border: 'none', cursor: 'pointer',
                    opacity: blockLoading ? 0.5 : 1,
                  }}
                >
                  Entsperren
                </button>
              </div>
            ) : (
              <div>
                <textarea
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                  placeholder="Grund für die Sperrung (optional)..."
                  rows={2}
                  style={{
                    width: '100%', background: '#0a0f1e', border: '1px solid #1e293b',
                    borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 14,
                    resize: 'none', marginBottom: 12, boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={() => handleBlock(true)}
                  disabled={blockLoading}
                  style={{
                    padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                    background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer',
                    opacity: blockLoading ? 0.5 : 1,
                  }}
                >
                  Kunde sperren
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───── Tab: Buchungen ───── */}
      {activeTab === 'buchungen' && (
        <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden' }}>
          {bookings.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
              Keine Buchungen vorhanden.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    {['ID', 'Produkt', 'Zeitraum', 'Status', 'Betrag'].map((h) => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b, i) => {
                    const st = BOOKING_STATUS[b.status] || { label: b.status, color: '#94a3b8', bg: '#94a3b814' };
                    return (
                      <tr
                        key={b.id}
                        onClick={() => router.push(`/admin/buchungen?id=${b.id}`)}
                        style={{
                          borderBottom: i < bookings.length - 1 ? '1px solid #1e293b' : 'none',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1e293b44'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>
                          {b.id.substring(0, 8)}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                          {b.product_name}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8' }}>
                          {fmtDate(b.rental_from)} — {fmtDate(b.rental_to)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            display: 'inline-block', padding: '3px 10px', borderRadius: 6,
                            fontSize: 12, fontWeight: 600, color: st.color, background: st.bg,
                          }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                          {formatCurrency(b.price_total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───── Tab: Schäden ───── */}
      {activeTab === 'schaeden' && (
        <div>
          {damages.length === 0 ? (
            <div style={{
              background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
              padding: 32, textAlign: 'center', color: '#64748b',
            }}>
              Keine Schadensmeldungen vorhanden.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {damages.map((d) => {
                const st = DAMAGE_STATUS[d.status] || { label: d.status, color: '#94a3b8', bg: '#94a3b814' };
                return (
                  <div key={d.id} style={{
                    background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
                    padding: 20,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{fmtDate(d.created_at)}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{d.product_name}</span>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 6,
                        fontSize: 12, fontWeight: 600, color: st.color, background: st.bg,
                        marginLeft: 'auto',
                      }}>
                        {st.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                      {d.description ? (d.description.length > 200 ? d.description.substring(0, 200) + '...' : d.description) : '—'}
                    </p>
                    {d.damage_amount > 0 && (
                      <div style={{ marginTop: 8, fontSize: 13, color: '#ef4444', fontWeight: 600 }}>
                        Schadenshöhe: {formatCurrency(d.damage_amount)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───── Tab: Nachrichten ───── */}
      {activeTab === 'nachrichten' && (
        <div>
          {conversations.length === 0 ? (
            <div style={{
              background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
              padding: 32, textAlign: 'center', color: '#64748b',
            }}>
              Keine Nachrichten vorhanden.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {conversations.map((conv) => (
                <div key={conv.id} style={{
                  background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
                  padding: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                      {conv.subject || 'Konversation'}
                    </h3>
                    {conv.closed && (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        fontSize: 11, fontWeight: 600, color: '#64748b', background: '#64748b14',
                      }}>
                        Geschlossen
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto' }}>
                      {fmtDate(conv.created_at)}
                    </span>
                  </div>

                  {/* Chat messages */}
                  <div style={{
                    maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {conv.messages.map((msg) => {
                      const isAdmin = msg.sender_type === 'admin';
                      return (
                        <div
                          key={msg.id}
                          style={{
                            display: 'flex',
                            justifyContent: isAdmin ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <div style={{
                            maxWidth: '75%',
                            padding: '10px 14px',
                            borderRadius: 12,
                            background: isAdmin ? '#06b6d420' : '#1e293b',
                            borderBottomRightRadius: isAdmin ? 4 : 12,
                            borderBottomLeftRadius: isAdmin ? 12 : 4,
                          }}>
                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                              {isAdmin ? 'Admin' : 'Kunde'} — {fmtDateTime(msg.created_at)}
                            </div>
                            <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                              {msg.body}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───── Tab: Bewertungen ───── */}
      {activeTab === 'bewertungen' && (
        <div>
          {reviews.length === 0 ? (
            <div style={{
              background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
              padding: 32, textAlign: 'center', color: '#64748b',
            }}>
              Keine Bewertungen vorhanden.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reviews.map((r) => (
                <div key={r.id} style={{
                  background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
                  padding: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                      {r.product_name || r.product_id || '—'}
                    </span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <svg
                          key={star}
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill={star <= r.rating ? '#f59e0b' : '#1e293b'}
                          stroke={star <= r.rating ? '#f59e0b' : '#475569'}
                          strokeWidth={1.5}
                        >
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      ))}
                    </div>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto' }}>
                      {fmtDate(r.created_at)}
                    </span>
                  </div>
                  {r.title && (
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
                      {r.title}
                    </div>
                  )}
                  <p style={{ fontSize: 14, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                    {r.text || '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───── Tab: Notizen ───── */}
      {activeTab === 'notizen' && (
        <div>
          {/* Add note form */}
          <div style={{
            background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
            padding: 20, marginBottom: 20,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 12, marginTop: 0 }}>
              Neue Notiz
            </h2>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Interne Notiz eingeben..."
              rows={3}
              style={{
                width: '100%', background: '#0a0f1e', border: '1px solid #1e293b',
                borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 14,
                resize: 'vertical', marginBottom: 12, boxSizing: 'border-box',
                lineHeight: 1.5,
              }}
            />
            <button
              onClick={handleAddNote}
              disabled={noteSaving || !noteText.trim()}
              style={{
                padding: '8px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: '#06b6d4', color: 'white', border: 'none', cursor: 'pointer',
                opacity: noteSaving || !noteText.trim() ? 0.5 : 1,
              }}
            >
              {noteSaving ? 'Speichern...' : 'Notiz speichern'}
            </button>
          </div>

          {/* Notes list */}
          {notes.length === 0 ? (
            <div style={{
              background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
              padding: 32, textAlign: 'center', color: '#64748b',
            }}>
              Noch keine Notizen vorhanden.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notes.map((note) => (
                <div key={note.id} style={{
                  background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
                  padding: 20,
                }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    {fmtDateTime(note.created_at)}
                  </div>
                  <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {note.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───── Sub-components ───── */
function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 11, color: '#64748b', textTransform: 'uppercase',
        letterSpacing: '0.5px', marginBottom: 4, fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: '#e2e8f0' }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: '#111827', borderRadius: 12, border: '1px solid #1e293b',
      padding: 20,
    }}>
      <div style={{
        fontSize: 11, color: '#64748b', textTransform: 'uppercase',
        letterSpacing: '0.5px', marginBottom: 8, fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#06b6d4' }}>
        {value}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

type UgcStatus = 'pending' | 'approved' | 'featured' | 'rejected' | 'withdrawn';

interface UgcEntry {
  id: string;
  booking_id: string;
  customer_email: string | null;
  customer_name: string | null;
  file_paths: string[];
  file_kinds: string[];
  caption: string | null;
  status: UgcStatus;
  consent_use_website: boolean;
  consent_use_social: boolean;
  consent_use_blog: boolean;
  consent_use_marketing: boolean;
  consent_name_visible: boolean;
  reward_coupon_code: string | null;
  bonus_coupon_code: string | null;
  featured_at: string | null;
  featured_channel: string | null;
  rejected_reason: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  is_test: boolean;
}

type Counts = {
  pending: number;
  approved: number;
  featured: number;
  rejected: number;
  withdrawn: number;
};

interface DetailData {
  submission: UgcEntry & {
    user_id: string | null;
    consent_ip: string | null;
    consent_at: string;
    withdrawn_at: string | null;
    withdrawn_reason: string | null;
    featured_reference: string | null;
  };
  booking: {
    id: string;
    product_name: string;
    product_id: string;
    rental_from: string;
    rental_to: string;
    customer_name: string;
    customer_email: string;
  } | null;
  previews: { path: string; kind: string; url: string; size: number }[];
}

const STATUS_CONFIG: Record<UgcStatus, { label: string; cls: string }> = {
  pending: { label: 'Wartet auf Pruefung', cls: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200' },
  approved: { label: 'Freigegeben', cls: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200' },
  featured: { label: 'Veröffentlicht', cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200' },
  rejected: { label: 'Abgelehnt', cls: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' },
  withdrawn: { label: 'Zurückgezogen', cls: 'bg-gray-100 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300' },
};

export default function KundenMaterialPage() {
  const searchParams = useSearchParams();
  const initialOpen = searchParams.get('open');

  const [entries, setEntries] = useState<UgcEntry[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, featured: 0, rejected: 0, withdrawn: 0 });
  const [filter, setFilter] = useState<UgcStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filter === 'all' ? '/api/admin/customer-ugc?status=all' : `/api/admin/customer-ugc?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Fehler beim Laden.');
      setEntries(data.entries ?? []);
      setCounts(data.counts ?? { pending: 0, approved: 0, featured: 0, rejected: 0, withdrawn: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-Open aus URL-Parameter
  useEffect(() => {
    if (initialOpen) {
      void openDetail(initialOpen);
    }
  }, [initialOpen]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/customer-ugc/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Fehler');
      setDetail(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Laden.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleApprove() {
    if (!detail) return;
    if (!confirm('Material freigeben und Gutschein versenden?')) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/customer-ugc/${detail.submission.id}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Freigabe fehlgeschlagen.');
      alert(`Freigegeben. Gutschein: ${data.couponCode ?? '—'}`);
      setDetail(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReject() {
    if (!detail) return;
    const reason = prompt('Begründung für Ablehnung (wird dem Kunden zugeschickt):');
    if (!reason || !reason.trim()) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/customer-ugc/${detail.submission.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Ablehnung fehlgeschlagen.');
      alert('Abgelehnt und Kunde benachrichtigt.');
      setDetail(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleFeature(channel: 'social' | 'blog' | 'website' | 'other') {
    if (!detail) return;
    const reference = prompt(`Referenz (URL/Post-ID) für den ${channel}-Kanal (optional):`) ?? '';
    if (!confirm(`Als "${channel}" veröffentlicht markieren und Bonus-Gutschein senden?`)) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/customer-ugc/${detail.submission.id}/feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, reference }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Feature fehlgeschlagen.');
      alert(`Feature markiert. Bonus-Gutschein: ${data.bonusCode ?? '—'}`);
      setDetail(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;
    if (!confirm('Einreichung und alle Dateien endgültig löschen?')) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/admin/customer-ugc/${detail.submission.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Löschen fehlgeschlagen.');
      setDetail(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler.');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AdminBackLink />

        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold text-brand-black dark:text-white">Kundenmaterial</h1>
          <p className="font-body text-sm text-brand-steel dark:text-white/60 mt-1">
            Von Kunden hochgeladene Fotos und Videos — prüfen, freigeben, feature-markieren.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <CountPill label="Wartet" n={counts.pending} onClick={() => setFilter('pending')} active={filter === 'pending'} color="amber" />
          <CountPill label="Freigegeben" n={counts.approved} onClick={() => setFilter('approved')} active={filter === 'approved'} color="green" />
          <CountPill label="Veröffentlicht" n={counts.featured} onClick={() => setFilter('featured')} active={filter === 'featured'} color="purple" />
          <CountPill label="Abgelehnt" n={counts.rejected} onClick={() => setFilter('rejected')} active={filter === 'rejected'} color="red" />
          <CountPill label="Zurückgezogen" n={counts.withdrawn} onClick={() => setFilter('withdrawn')} active={filter === 'withdrawn'} color="gray" />
        </div>

        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="font-body text-brand-steel dark:text-white/60">Filter:</span>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-body ${filter === 'all' ? 'bg-accent-blue text-white' : 'bg-gray-100 dark:bg-gray-800 text-brand-steel dark:text-white/70'}`}
          >
            Alle anzeigen
          </button>
        </div>

        {loading && <p className="font-body text-brand-steel dark:text-white/60">Lädt …</p>}
        {error && <p className="font-body text-red-600">{error}</p>}

        {!loading && entries.length === 0 && (
          <p className="font-body text-brand-steel dark:text-white/60 py-12 text-center">
            Keine Einreichungen in dieser Ansicht.
          </p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((e) => (
            <button
              key={e.id}
              onClick={() => openDetail(e.id)}
              className="text-left bg-white dark:bg-brand-dark rounded-card shadow-card p-4 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-heading font-semibold text-sm text-brand-black dark:text-white truncate">
                  {e.customer_name ?? 'Unbekannt'}
                </p>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-body font-medium ${STATUS_CONFIG[e.status].cls}`}>
                  {STATUS_CONFIG[e.status].label}
                </span>
              </div>
              <p className="font-body text-xs text-brand-steel dark:text-white/60 mb-2 truncate">
                Buchung {e.booking_id}
              </p>
              <p className="font-body text-xs text-brand-steel dark:text-white/50 mb-2">
                {e.file_paths.length} {e.file_paths.length === 1 ? 'Datei' : 'Dateien'} ·{' '}
                {e.file_kinds.filter((k) => k === 'video').length > 0 ? '🎥 Video' : '📷 Foto'}
              </p>
              <p className="font-body text-[10px] text-brand-steel dark:text-white/40">
                {fmtDateTime(e.created_at)}
              </p>
              {e.is_test && (
                <span className="inline-block mt-2 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded text-[10px] font-body">
                  TEST
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Detail-Modal */}
      {(detailLoading || detail) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-brand-dark rounded-card shadow-xl max-w-3xl w-full my-4">
            {detailLoading && <p className="p-8 font-body text-brand-steel dark:text-white/60 text-center">Lädt …</p>}

            {detail && (
              <>
                <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200 dark:border-gray-800">
                  <div>
                    <h2 className="font-heading text-xl font-bold text-brand-black dark:text-white">
                      {detail.submission.customer_name ?? 'Unbekannt'}
                    </h2>
                    <p className="font-body text-sm text-brand-steel dark:text-white/60">
                      {detail.submission.customer_email ?? '—'} · Buchung{' '}
                      <Link
                        href={`/admin/buchungen/${detail.submission.booking_id}`}
                        className="text-accent-blue hover:underline"
                        target="_blank"
                      >
                        {detail.submission.booking_id}
                      </Link>
                    </p>
                    {detail.booking && (
                      <p className="font-body text-xs text-brand-steel dark:text-white/50 mt-1">
                        {detail.booking.product_name}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setDetail(null)}
                    className="text-brand-steel dark:text-white/60 hover:text-brand-black dark:hover:text-white text-2xl leading-none"
                    aria-label="Schließen"
                  >
                    ×
                  </button>
                </div>

                <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                  {/* Medien */}
                  <div>
                    <h3 className="font-heading text-sm font-bold text-brand-black dark:text-white mb-2">
                      Medien ({detail.previews.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {detail.previews.map((p, i) => (
                        <div key={i} className="relative aspect-square rounded overflow-hidden bg-gray-100 dark:bg-gray-900">
                          {p.kind === 'video' ? (
                            <video src={p.url} className="w-full h-full object-cover" controls />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.url} alt={`Datei ${i + 1}`} className="w-full h-full object-cover" />
                          )}
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener"
                            className="absolute bottom-1 right-1 text-[10px] bg-black/70 text-white px-2 py-0.5 rounded"
                          >
                            öffnen
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Caption */}
                  {detail.submission.caption && (
                    <div>
                      <h3 className="font-heading text-sm font-bold text-brand-black dark:text-white mb-1">Beschreibung</h3>
                      <p className="font-body text-sm text-brand-steel dark:text-white/80 italic">
                        „{detail.submission.caption}“
                      </p>
                    </div>
                  )}

                  {/* Einwilligungen */}
                  <div>
                    <h3 className="font-heading text-sm font-bold text-brand-black dark:text-white mb-2">Einwilligungen</h3>
                    <div className="grid grid-cols-2 gap-1 text-xs font-body">
                      <ConsentRow label="Website" yes={detail.submission.consent_use_website} />
                      <ConsentRow label="Social Media" yes={detail.submission.consent_use_social} />
                      <ConsentRow label="Blog" yes={detail.submission.consent_use_blog} />
                      <ConsentRow label="Marketing" yes={detail.submission.consent_use_marketing} />
                      <ConsentRow label="Name sichtbar" yes={detail.submission.consent_name_visible} />
                    </div>
                    <p className="mt-2 font-body text-[10px] text-brand-steel dark:text-white/50">
                      Erteilt am {fmtDateTime(detail.submission.consent_at)}
                      {detail.submission.consent_ip ? ` · IP ${detail.submission.consent_ip}` : ''}
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <h3 className="font-heading text-sm font-bold text-brand-black dark:text-white mb-2">Status</h3>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-body font-medium ${STATUS_CONFIG[detail.submission.status].cls}`}>
                        {STATUS_CONFIG[detail.submission.status].label}
                      </span>
                      {detail.submission.reviewed_at && (
                        <span className="text-xs font-body text-brand-steel dark:text-white/60">
                          · geprüft {fmtDateTime(detail.submission.reviewed_at)}
                        </span>
                      )}
                    </div>
                    {detail.submission.reward_coupon_code && (
                      <p className="font-body text-xs text-brand-steel dark:text-white/70">
                        Freigabe-Gutschein: <span className="font-mono">{detail.submission.reward_coupon_code}</span>
                      </p>
                    )}
                    {detail.submission.bonus_coupon_code && (
                      <p className="font-body text-xs text-brand-steel dark:text-white/70">
                        Feature-Bonus: <span className="font-mono">{detail.submission.bonus_coupon_code}</span>
                      </p>
                    )}
                    {detail.submission.featured_at && (
                      <p className="font-body text-xs text-brand-steel dark:text-white/70">
                        Veröffentlicht auf {detail.submission.featured_channel} am {fmtDateTime(detail.submission.featured_at)}
                        {detail.submission.featured_reference ? ` (${detail.submission.featured_reference})` : ''}
                      </p>
                    )}
                    {detail.submission.rejected_reason && (
                      <p className="font-body text-xs text-red-600 dark:text-red-400">
                        Ablehnungsgrund: {detail.submission.rejected_reason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-brand-black/50 flex flex-wrap gap-2">
                  {detail.submission.status === 'pending' && (
                    <>
                      <button
                        onClick={handleApprove}
                        disabled={actionBusy}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-body font-medium rounded disabled:opacity-50"
                      >
                        ✓ Freigeben + Gutschein
                      </button>
                      <button
                        onClick={handleReject}
                        disabled={actionBusy}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-body font-medium rounded disabled:opacity-50"
                      >
                        ✗ Ablehnen
                      </button>
                    </>
                  )}

                  {detail.submission.status === 'approved' && (
                    <>
                      <button onClick={() => handleFeature('social')} disabled={actionBusy} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-body rounded disabled:opacity-50">
                        ⭐ Social-Post
                      </button>
                      <button onClick={() => handleFeature('blog')} disabled={actionBusy} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-body rounded disabled:opacity-50">
                        ⭐ Blog
                      </button>
                      <button onClick={() => handleFeature('website')} disabled={actionBusy} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-body rounded disabled:opacity-50">
                        ⭐ Website
                      </button>
                    </>
                  )}

                  <div className="flex-1" />

                  <button
                    onClick={handleDelete}
                    disabled={actionBusy}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-body rounded disabled:opacity-50"
                  >
                    Endgültig löschen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CountPill({
  label,
  n,
  onClick,
  active,
  color,
}: {
  label: string;
  n: number;
  onClick: () => void;
  active: boolean;
  color: 'amber' | 'green' | 'purple' | 'red' | 'gray';
}) {
  const activeCls: Record<string, string> = {
    amber: 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-950/30',
    green: 'ring-2 ring-green-500 bg-green-50 dark:bg-green-950/30',
    purple: 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-950/30',
    red: 'ring-2 ring-red-500 bg-red-50 dark:bg-red-950/30',
    gray: 'ring-2 ring-gray-500 bg-gray-50 dark:bg-gray-900/30',
  };
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-card bg-white dark:bg-brand-dark shadow-card hover:shadow-lg transition ${active ? activeCls[color] : ''}`}
    >
      <p className="font-body text-xs text-brand-steel dark:text-white/60 mb-1">{label}</p>
      <p className="font-heading text-2xl font-bold text-brand-black dark:text-white">{n}</p>
    </button>
  );
}

function ConsentRow({ label, yes }: { label: string; yes: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={yes ? 'text-green-600' : 'text-gray-400'}>{yes ? '✓' : '✗'}</span>
      <span className={yes ? 'text-brand-black dark:text-white' : 'text-brand-steel dark:text-white/50'}>{label}</span>
    </div>
  );
}

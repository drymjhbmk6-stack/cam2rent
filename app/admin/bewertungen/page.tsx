'use client';

import { useState, useEffect } from 'react';

const C = {
  bg: '#0a0f1e',
  card: '#111827',
  border: '#1e293b',
  cyan: '#06b6d4',
  cyanLight: '#22d3ee',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
} as const;

interface Review {
  id: string;
  booking_id: string;
  product_id: string;
  product_name: string;
  customer_name: string;
  customer_email: string;
  rating: number;
  title: string | null;
  text: string | null;
  approved: boolean;
  created_at: string;
  admin_reply: string | null;
  admin_reply_at: string | null;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={14} height={14} viewBox="0 0 20 20" fill={i <= rating ? '#f59e0b' : '#334155'}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export default function AdminBewertungenPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function loadReviews() {
    try {
      const res = await fetch(`/api/admin/reviews?filter=${filter}`);
      const data = await res.json();
      setReviews(data.reviews ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function handleAction(reviewId: string, action: 'approve' | 'reject' | 'reply', reply?: string) {
    setActionLoading(reviewId);
    try {
      await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, action, reply }),
      });
      setReplyId(null);
      setReplyText('');
      await loadReviews();
    } catch {
    } finally {
      setActionLoading(null);
    }
  }

  const counts = {
    all: reviews.length,
    pending: reviews.filter((r) => !r.approved).length,
    approved: reviews.filter((r) => r.approved).length,
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1000 }}>
      <h1 className="font-heading font-bold text-xl mb-1" style={{ color: C.text }}>
        Bewertungen
      </h1>
      <p className="text-sm mb-6" style={{ color: C.textDim }}>
        Kundenbewertungen prüfen, genehmigen und beantworten
      </p>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'approved'] as const).map((f) => {
          const labels = { all: 'Alle', pending: 'Ausstehend', approved: 'Genehmigt' };
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={active
                ? { background: `${C.cyan}20`, color: C.cyanLight, border: `1px solid ${C.cyan}40` }
                : { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}` }
              }
            >
              {labels[f]}
              {filter === 'all' && (
                <span className="ml-1.5 text-xs" style={{ opacity: 0.6 }}>
                  {f === 'pending' ? counts.pending : f === 'approved' ? counts.approved : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ color: C.textDim, padding: 40, textAlign: 'center' }}>Laden...</div>
      ) : reviews.length === 0 ? (
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
          color: C.textDim,
          fontSize: 14,
        }}>
          Keine Bewertungen vorhanden.
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div
              key={review.id}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <Stars rating={review.rating} />
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={review.approved
                        ? { background: `${C.green}20`, color: C.green }
                        : { background: `${C.yellow}20`, color: C.yellow }
                      }
                    >
                      {review.approved ? 'Genehmigt' : 'Ausstehend'}
                    </span>
                  </div>
                  <div className="text-sm" style={{ color: C.text }}>
                    <span className="font-semibold">{review.customer_name}</span>
                    <span style={{ color: C.textDim }}> · {review.product_name}</span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: C.textDim }}>
                    {new Date(review.created_at).toLocaleDateString('de-DE', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                    {' · '}
                    <span style={{ fontFamily: 'monospace' }}>{review.booking_id}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 shrink-0">
                  {!review.approved && (
                    <button
                      onClick={() => handleAction(review.id, 'approve')}
                      disabled={actionLoading === review.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                      style={{ background: `${C.green}20`, color: C.green }}
                    >
                      Genehmigen
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (replyId === review.id) {
                        setReplyId(null);
                        setReplyText('');
                      } else {
                        setReplyId(review.id);
                        setReplyText(review.admin_reply || '');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: `${C.cyan}20`, color: C.cyanLight }}
                  >
                    Antworten
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Bewertung wirklich löschen?')) {
                        handleAction(review.id, 'reject');
                      }
                    }}
                    disabled={actionLoading === review.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                    style={{ background: `${C.red}20`, color: C.red }}
                  >
                    Löschen
                  </button>
                </div>
              </div>

              {/* Content */}
              {review.title && (
                <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>
                  {review.title}
                </div>
              )}
              {review.text && (
                <div className="text-sm leading-relaxed" style={{ color: C.textMuted }}>
                  {review.text}
                </div>
              )}

              {/* Existing admin reply */}
              {review.admin_reply && replyId !== review.id && (
                <div className="mt-3 pl-4" style={{ borderLeft: `2px solid ${C.cyan}` }}>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: C.cyan }}>
                    Deine Antwort
                  </div>
                  <div className="text-sm" style={{ color: C.textMuted }}>
                    {review.admin_reply}
                  </div>
                </div>
              )}

              {/* Reply form */}
              {replyId === review.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                    placeholder="Deine Antwort..."
                    className="w-full text-sm rounded-lg resize-none"
                    style={{
                      background: '#0a0f1e',
                      border: `1px solid ${C.border}`,
                      padding: '10px 12px',
                      color: C.text,
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(review.id, 'reply', replyText)}
                      disabled={!replyText.trim() || actionLoading === review.id}
                      className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                      style={{ background: C.cyan, color: 'white' }}
                    >
                      Antwort speichern
                    </button>
                    <button
                      onClick={() => { setReplyId(null); setReplyText(''); }}
                      className="px-4 py-2 rounded-lg text-xs font-semibold"
                      style={{ background: C.border, color: C.textMuted }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

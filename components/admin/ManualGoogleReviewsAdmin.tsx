'use client';

import { useEffect, useState } from 'react';

/**
 * Admin-Editor für manuell gepflegte Google-Bewertungen. Wird auf der
 * Startseite zusammen mit den API-Reviews + internen Reviews in einer
 * Section angezeigt — und schlägt damit das Google-Hard-Limit von 5 Reviews
 * pro Places-API-Anfrage.
 *
 * Speicherung: admin_settings.manual_google_reviews = ManualReview[]
 *   { id, author, rating, text, date }
 *
 * Lese-/Schreibpfad: /api/admin/settings?key=manual_google_reviews
 */

interface ManualReview {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string; // YYYY-MM-DD
}

const inputClass =
  'w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500';

function newReview(): ManualReview {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    author: '',
    rating: 5,
    text: '',
    date: new Date().toISOString().slice(0, 10),
  };
}

function normalize(parsed: unknown): ManualReview[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((r) => r && typeof r === 'object')
    .map((r, i) => {
      const obj = r as Record<string, unknown>;
      return {
        id: String(obj.id ?? `${Date.now()}-${i}`),
        author: String(obj.author ?? '').slice(0, 120),
        rating: Math.max(1, Math.min(5, Number(obj.rating) || 5)),
        text: String(obj.text ?? '').slice(0, 1500),
        date: typeof obj.date === 'string' ? obj.date.slice(0, 10) : '',
      };
    });
}

export default function ManualGoogleReviewsAdmin() {
  const [reviews, setReviews] = useState<ManualReview[]>([]);
  const [reviewUrl, setReviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings?key=manual_google_reviews').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/admin/settings?key=google_review_url').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([reviewsData, urlData]) => {
        if (reviewsData?.value !== undefined) {
          const val = typeof reviewsData.value === 'string' ? JSON.parse(reviewsData.value) : reviewsData.value;
          setReviews(normalize(val));
        }
        if (urlData?.value !== undefined && urlData.value !== null) {
          const raw = typeof urlData.value === 'string' ? urlData.value : '';
          setReviewUrl(raw.replace(/^["']|["']$/g, ''));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const sanitized = reviews
        .map((r) => ({ ...r, author: r.author.trim(), text: r.text.trim() }))
        .filter((r) => r.author && r.text); // leere Zeilen verwerfen
      const trimmedUrl = reviewUrl.trim();
      const urlValid = trimmedUrl === '' || /^https?:\/\//i.test(trimmedUrl);
      if (!urlValid) {
        setMsg({ type: 'err', text: 'Link muss mit http:// oder https:// beginnen.' });
        setSaving(false);
        return;
      }

      // Beide Settings parallel speichern.
      const [r1, r2] = await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'manual_google_reviews', value: sanitized }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'google_review_url', value: trimmedUrl }),
        }),
      ]);
      if (!r1.ok || !r2.ok) {
        const errData = await (r1.ok ? r2 : r1).json().catch(() => ({}));
        setMsg({ type: 'err', text: errData?.error ?? 'Speichern fehlgeschlagen.' });
        return;
      }
      setReviews(sanitized);
      setReviewUrl(trimmedUrl);
      setMsg({ type: 'ok', text: 'Gespeichert.' });
      window.setTimeout(() => setMsg(null), 3500);
    } catch {
      setMsg({ type: 'err', text: 'Netzwerkfehler.' });
    } finally {
      setSaving(false);
    }
  }

  function updateAt(idx: number, patch: Partial<ManualReview>) {
    setReviews((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeAt(idx: number) {
    setReviews((prev) => prev.filter((_, i) => i !== idx));
  }

  function add() {
    setReviews((prev) => [...prev, newReview()]);
  }

  return (
    <div className="rounded-xl border" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #1e293b' }}>
        <div>
          <h3 className="font-heading font-bold text-base" style={{ color: '#f1f5f9' }}>
            Manuelle Google-Bewertungen
          </h3>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            Google liefert über die API nur die letzten 5 Bewertungen. Hier können Sie weitere Bewertungen aus Google Business
            manuell eintragen — sie werden auf der Startseite zusammen mit den API-Bewertungen angezeigt.
          </p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Bewertungs-Link Override */}
        <div className="rounded-lg p-4" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            &quot;Bewertung auf Google schreiben&quot;-Link
          </label>
          <p className="text-xs text-slate-500 mb-2">
            Wird auf der Startseite als CTA verwendet. Leer lassen für den Standard-Link aus der Place-ID.
            Bei Problemen: in Google Business → &quot;Mehr Bewertungen erhalten&quot; → Link kopieren.
          </p>
          <input
            type="url"
            value={reviewUrl}
            onChange={(e) => setReviewUrl(e.target.value)}
            placeholder="https://search.google.com/local/writereview?placeid=..."
            className={inputClass}
          />
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Lädt…</p>
        ) : reviews.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-slate-700 px-4 py-8 text-center">
            <p className="text-sm text-slate-400 mb-3">Noch keine manuellen Bewertungen.</p>
            <button
              type="button"
              onClick={add}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: '#06b6d4', color: '#0f172a' }}
            >
              + Erste Bewertung hinzufügen
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {reviews.map((review, idx) => (
                <div
                  key={review.id}
                  className="rounded-lg border p-4 space-y-3"
                  style={{ background: '#1e293b', borderColor: '#334155' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <StarRatingPicker rating={review.rating} onChange={(r) => updateAt(idx, { rating: r })} />
                      <span className="text-xs text-slate-400">{review.rating}/5</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                      title="Bewertung löschen"
                    >
                      ✕ Löschen
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        Autor
                      </label>
                      <input
                        type="text"
                        value={review.author}
                        onChange={(e) => updateAt(idx, { author: e.target.value })}
                        placeholder="z.B. Maria Müller"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        Datum
                      </label>
                      <input
                        type="date"
                        value={review.date}
                        onChange={(e) => updateAt(idx, { date: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Bewertungstext
                    </label>
                    <textarea
                      value={review.text}
                      onChange={(e) => updateAt(idx, { text: e.target.value })}
                      rows={3}
                      placeholder='"Tolle Cam, schnelle Lieferung, gerne wieder!"'
                      className={inputClass}
                      style={{ resize: 'vertical' }}
                    />
                    <p className="text-[10px] text-slate-500 mt-1">{review.text.length}/1500 Zeichen</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={add}
              className="w-full px-4 py-2 rounded-lg text-sm font-semibold border border-dashed transition-all"
              style={{ borderColor: '#475569', color: '#94a3b8' }}
            >
              + Weitere Bewertung hinzufügen
            </button>
          </>
        )}
      </div>

      <div className="px-6 py-3 flex items-center justify-between gap-3" style={{ borderTop: '1px solid #1e293b' }}>
        <div className="text-xs">
          {msg && (
            <span className={msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}>{msg.text}</span>
          )}
        </div>
        <button
          onClick={save}
          disabled={saving || loading}
          className="px-5 py-2 rounded-lg text-sm font-heading font-semibold transition-all disabled:opacity-50"
          style={{ background: '#06b6d4', color: '#0f172a' }}
        >
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}

function StarRatingPicker({ rating, onChange }: { rating: number; onChange: (r: number) => void }) {
  return (
    <div className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className="hover:scale-110 transition-transform"
          title={`${i} Stern${i !== 1 ? 'e' : ''}`}
        >
          <svg width={20} height={20} viewBox="0 0 20 20" fill={i <= rating ? '#f59e0b' : '#475569'}>
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

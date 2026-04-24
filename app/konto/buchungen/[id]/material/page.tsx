'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { createAuthBrowserClient } from '@/lib/supabase-auth';
import { fmtDateShort } from '@/lib/format-utils';

type Preview = { path: string; kind: string; url: string };

type SubmissionData = {
  id: string;
  status: 'pending' | 'approved' | 'featured' | 'rejected' | 'withdrawn';
  file_paths: string[];
  file_kinds: string[];
  file_sizes: number[];
  caption: string | null;
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
  withdrawn_at: string | null;
  previews: Preview[];
};

type BookingData = {
  id: string;
  status: string;
  productName: string;
  rentalFrom: string;
  rentalTo: string;
};

const MAX_FILES = 5;
const MAX_SIZE_MB = 50;

export default function MaterialUploadPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const bookingId = params.id;

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [consent, setConsent] = useState({
    use_website: true,
    use_social: true,
    use_blog: false,
    use_marketing: false,
    name_visible: false,
  });
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/login?redirect=/konto/buchungen/${bookingId}/material`);
      return;
    }
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, bookingId]);

  async function loadData() {
    try {
      setLoading(true);
      const supabase = createAuthBrowserClient();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Nicht eingeloggt.');

      const res = await fetch(`/api/customer-ugc/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fehler beim Laden.');
      setBooking(data.booking);
      setSubmission(data.submission);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden.');
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    if (list.length === 0) return;

    const combined = [...files, ...list].slice(0, MAX_FILES);

    const tooLarge = combined.find((f) => f.size > MAX_SIZE_MB * 1024 * 1024);
    if (tooLarge) {
      setError(`Datei "${tooLarge.name}" ist zu groß (max. ${MAX_SIZE_MB} MB).`);
      return;
    }

    // Neue Preview-URLs erzeugen
    previews.forEach((url) => URL.revokeObjectURL(url));
    const urls = combined.map((f) => URL.createObjectURL(f));
    setFiles(combined);
    setPreviews(urls);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(idx: number) {
    URL.revokeObjectURL(previews[idx]);
    setFiles(files.filter((_, i) => i !== idx));
    setPreviews(previews.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    setError('');
    setSuccessMsg('');

    if (files.length === 0) {
      setError('Bitte wähle mindestens ein Foto oder Video aus.');
      return;
    }
    if (!consent.use_website && !consent.use_social && !consent.use_blog && !consent.use_marketing) {
      setError('Bitte stimme mindestens einem Nutzungskanal zu, damit wir dein Material verwenden dürfen.');
      return;
    }
    if (!acceptTerms) {
      setError('Bitte bestätige, dass du mit den Nutzungsbedingungen einverstanden bist.');
      return;
    }

    setUploading(true);
    try {
      const supabase = createAuthBrowserClient();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Nicht eingeloggt.');

      const fd = new FormData();
      fd.append('bookingId', bookingId);
      fd.append('caption', caption);
      fd.append('consent_use_website', String(consent.use_website));
      fd.append('consent_use_social', String(consent.use_social));
      fd.append('consent_use_blog', String(consent.use_blog));
      fd.append('consent_use_marketing', String(consent.use_marketing));
      fd.append('consent_name_visible', String(consent.name_visible));
      files.forEach((f) => fd.append('files', f));

      const res = await fetch('/api/customer-ugc/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload fehlgeschlagen.');

      setSuccessMsg(
        `Danke! Dein Material wurde hochgeladen und wird geprüft. Nach Freigabe erhältst du deinen Gutschein per E-Mail (${data.reward?.discountPercent ?? 15}% Rabatt).`,
      );
      previews.forEach((u) => URL.revokeObjectURL(u));
      setFiles([]);
      setPreviews([]);
      setCaption('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  }

  async function handleWithdraw() {
    if (!submission) return;
    if (!confirm('Möchtest du deine Einreichung wirklich zurückziehen? Deine Dateien werden dauerhaft gelöscht.')) {
      return;
    }

    try {
      const supabase = createAuthBrowserClient();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Nicht eingeloggt.');

      const res = await fetch(`/api/customer-ugc/withdraw/${submission.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Widerruf fehlgeschlagen.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Widerruf fehlgeschlagen.');
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4">
        <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 max-w-md">
          <p className="font-body text-brand-steel dark:text-white/70">
            {error || 'Buchung nicht gefunden.'}
          </p>
          <Link
            href="/konto/buchungen"
            className="inline-block mt-4 text-accent-blue hover:underline font-body font-medium"
          >
            ← Zurück zu meinen Buchungen
          </Link>
        </div>
      </div>
    );
  }

  const canUpload = ['picked_up', 'shipped', 'returned', 'completed'].includes(booking.status);
  const hasActiveSubmission =
    submission && ['pending', 'approved', 'featured'].includes(submission.status);

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black py-8 px-4 sm:py-12">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/konto/buchungen"
          className="inline-flex items-center gap-2 text-sm font-body text-brand-steel dark:text-white/60 hover:text-accent-blue mb-6"
        >
          ← Zurück zu meinen Buchungen
        </Link>

        <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6 sm:p-8 mb-6">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-brand-black dark:text-white mb-2">
            Dein Material hochladen
          </h1>
          <p className="font-body text-sm text-brand-steel dark:text-white/70">
            {booking.productName} · {fmtDateShort(booking.rentalFrom)} – {fmtDateShort(booking.rentalTo)}
          </p>
        </div>

        {/* Anreiz-Box */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-2 border-amber-200 dark:border-amber-800/50 rounded-card p-6 mb-6">
          <h2 className="font-heading font-bold text-lg text-amber-900 dark:text-amber-200 mb-3">
            Das bringt dir dein Upload
          </h2>
          <ul className="space-y-2 text-sm font-body text-amber-900 dark:text-amber-100">
            <li className="flex gap-2">
              <span className="text-amber-600 dark:text-amber-400">✓</span>
              <span>
                <strong>15 % Rabatt</strong> auf deine nächste Miete — sofort nach Prüfung per E-Mail (gültig 120 Tage, ab 50 € Bestellwert).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-600 dark:text-amber-400">✓</span>
              <span>
                <strong>Zusätzlich 25 % Rabatt-Gutschein</strong>, wenn wir dein Material tatsächlich posten oder auf der Website zeigen.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-600 dark:text-amber-400">✓</span>
              <span>
                Auf Wunsch werden dein Vorname und deine Abenteuer-Story geteilt — du entscheidest, was sichtbar wird.
              </span>
            </li>
          </ul>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-card p-4 mb-6 text-sm font-body text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-card p-4 mb-6 text-sm font-body text-green-700 dark:text-green-300">
            {successMsg}
          </div>
        )}

        {/* Bestehende Einreichung anzeigen */}
        {hasActiveSubmission && submission && (
          <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6 sm:p-8 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="font-heading text-lg font-bold text-brand-black dark:text-white mb-1">
                  Dein Upload
                </h2>
                <p className="font-body text-xs text-brand-steel dark:text-white/60">
                  Eingereicht am {fmtDateShort(submission.created_at)}
                </p>
              </div>
              <StatusBadge status={submission.status} />
            </div>

            {submission.previews && submission.previews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {submission.previews.map((p, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900">
                    {p.kind === 'video' ? (
                      <video src={p.url} className="w-full h-full object-cover" controls />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt={`Upload ${i + 1}`} className="w-full h-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {submission.caption && (
              <p className="font-body text-sm text-brand-steel dark:text-white/70 italic mb-4">
                „{submission.caption}“
              </p>
            )}

            {submission.status === 'approved' && submission.reward_coupon_code && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-3 mb-4">
                <p className="font-body text-sm text-amber-900 dark:text-amber-200">
                  🎉 Dein Rabatt-Gutschein: <strong className="font-mono">{submission.reward_coupon_code}</strong>
                </p>
              </div>
            )}

            {submission.status === 'featured' && (
              <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded p-3 mb-4">
                <p className="font-body text-sm text-purple-900 dark:text-purple-200">
                  ⭐ Dein Material wurde veröffentlicht! Bonus-Gutschein: <strong className="font-mono">{submission.bonus_coupon_code ?? submission.reward_coupon_code}</strong>
                </p>
              </div>
            )}

            {submission.status === 'rejected' && submission.rejected_reason && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded p-3 mb-4 text-sm font-body text-red-700 dark:text-red-300">
                <strong>Abgelehnt:</strong> {submission.rejected_reason}
              </div>
            )}

            {submission.status !== 'rejected' && (
              <button
                onClick={handleWithdraw}
                className="text-sm font-body text-red-600 dark:text-red-400 hover:underline"
              >
                Einreichung zurückziehen
              </button>
            )}
          </div>
        )}

        {/* Upload-Formular */}
        {!hasActiveSubmission && canUpload && (
          <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6 sm:p-8">
            <h2 className="font-heading text-lg font-bold text-brand-black dark:text-white mb-4">
              Fotos & Videos hochladen
            </h2>

            <div className="mb-6">
              <label className="block font-body text-sm font-medium text-brand-black dark:text-white mb-2">
                Dateien (max. {MAX_FILES} Stück, je max. {MAX_SIZE_MB} MB)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
                onChange={handleFileChange}
                className="block w-full text-base text-brand-black dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-accent-blue file:text-white hover:file:bg-accent-blue/90 file:cursor-pointer"
              />
              <p className="mt-1 font-body text-xs text-brand-steel dark:text-white/50">
                JPG, PNG, WebP, HEIC oder MP4, MOV, WebM
              </p>
            </div>

            {files.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                {files.map((f, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900">
                    {f.type.startsWith('video/') ? (
                      <video src={previews[i]} className="w-full h-full object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previews[i]} alt={f.name} className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 w-7 h-7 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center text-sm"
                      aria-label="Entfernen"
                    >
                      ×
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-white text-xs truncate">{f.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-6">
              <label className="block font-body text-sm font-medium text-brand-black dark:text-white mb-2">
                Kurze Beschreibung (optional)
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 500))}
                maxLength={500}
                rows={3}
                placeholder="Wo aufgenommen? Was war besonders? (max. 500 Zeichen)"
                className="w-full px-3 py-2 text-base font-body border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-brand-black text-brand-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
              <p className="mt-1 text-xs font-body text-brand-steel dark:text-white/50 text-right">
                {caption.length}/500
              </p>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
              <h3 className="font-heading font-bold text-sm text-brand-black dark:text-white mb-3">
                Wo darf cam2rent dein Material verwenden?
              </h3>
              <div className="space-y-2">
                <ConsentCheckbox
                  label="Website (cam2rent.de)"
                  description="Produktseiten, Referenzen, Startseite"
                  checked={consent.use_website}
                  onChange={(v) => setConsent({ ...consent, use_website: v })}
                />
                <ConsentCheckbox
                  label="Social Media"
                  description="Instagram, Facebook (cam2rent-Kanäle)"
                  checked={consent.use_social}
                  onChange={(v) => setConsent({ ...consent, use_social: v })}
                />
                <ConsentCheckbox
                  label="Blog"
                  description="Artikel, Kundenstories im cam2rent-Blog"
                  checked={consent.use_blog}
                  onChange={(v) => setConsent({ ...consent, use_blog: v })}
                />
                <ConsentCheckbox
                  label="Marketing-Material"
                  description="Flyer, Newsletter, Werbeanzeigen"
                  checked={consent.use_marketing}
                  onChange={(v) => setConsent({ ...consent, use_marketing: v })}
                />
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <ConsentCheckbox
                  label="Mein Vorname darf bei Veröffentlichung sichtbar sein"
                  description="Sonst veröffentlichen wir anonym"
                  checked={consent.name_visible}
                  onChange={(v) => setConsent({ ...consent, name_visible: v })}
                />
              </div>
            </div>

            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 w-4 h-4 accent-accent-blue flex-shrink-0"
              />
              <span className="font-body text-xs text-brand-steel dark:text-white/70 leading-relaxed">
                Ich bestätige, dass ich Urheber der hochgeladenen Inhalte bin (oder alle notwendigen Rechte besitze) und dass alle abgebildeten Personen mit der Veröffentlichung einverstanden sind. Ich räume cam2rent für die oben ausgewählten Kanäle ein <strong>einfaches, zeitlich unbegrenztes, widerrufliches Nutzungsrecht</strong> ein (§ 22 KUG, § 31 UrhG). Der Widerruf gilt nur für zukünftige Nutzung. Einzelheiten in der{' '}
                <Link href="/datenschutz" target="_blank" className="text-accent-blue hover:underline">
                  Datenschutzerklärung
                </Link>
                .
              </span>
            </label>

            <button
              onClick={handleUpload}
              disabled={uploading || files.length === 0 || !acceptTerms}
              className="w-full py-3 bg-accent-blue hover:bg-accent-blue/90 text-white font-body font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {uploading ? 'Lädt hoch…' : `Hochladen${files.length > 0 ? ` (${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'})` : ''}`}
            </button>
          </div>
        )}

        {!canUpload && !hasActiveSubmission && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-card p-6 text-sm font-body text-blue-900 dark:text-blue-200">
            Material-Upload ist erst nach Beginn deiner Miete möglich. Die Option erscheint automatisch, sobald dein Paket verschickt oder abgeholt wurde.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    pending: { label: 'In Prüfung', cls: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200' },
    approved: { label: 'Freigegeben', cls: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200' },
    featured: { label: 'Veröffentlicht', cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200' },
    rejected: { label: 'Abgelehnt', cls: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' },
    withdrawn: { label: 'Zurückgezogen', cls: 'bg-gray-100 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-body font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function ConsentCheckbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 accent-accent-blue flex-shrink-0"
      />
      <div>
        <p className="font-body text-sm text-brand-black dark:text-white">{label}</p>
        <p className="font-body text-xs text-brand-steel dark:text-white/60">{description}</p>
      </div>
    </label>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

export default function VerifizierungPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createAuthBrowserClient();
    supabase
      .from('profiles')
      .select('verification_status')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setStatus((data?.verification_status as VerificationStatus) || 'none');
        setLoading(false);
      });
  }, [user]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setError('');

    if (selected.length !== 2) {
      setError('Bitte wähle genau 2 Bilder aus (Vorder- und Rückseite).');
      return;
    }

    for (const file of selected) {
      if (file.size > 5 * 1024 * 1024) {
        setError(`"${file.name}" ist zu groß (max 5 MB).`);
        return;
      }
    }

    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  }

  async function handleUpload() {
    if (files.length !== 2) {
      setError('Bitte wähle genau 2 Bilder aus (Vorder- und Rückseite).');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const supabase = createAuthBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('Bitte melde dich erneut an.');
        setUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append('front', files[0]);
      formData.append('back', files[1]);

      const res = await fetch('/api/upload-id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Fehler beim Hochladen.');
      } else {
        setSuccess('Dokumente wurden hochgeladen! Wir prüfen deinen Ausweis.');
        setStatus('pending');
        setPreviews([]);
        setFiles([]);
      }
    } catch {
      setError('Fehler beim Hochladen. Bitte versuche es erneut.');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-card shadow-card p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-card shadow-card p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent-blue-soft flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="font-heading font-bold text-lg text-brand-black">Identitätsverifizierung</h1>
            <p className="text-sm text-brand-steel">Verifiziere dein Konto für Buchungen</p>
          </div>
        </div>

        {/* Status: Verifiziert */}
        {status === 'verified' && (
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-heading font-bold text-green-800 text-lg mb-2">Konto verifiziert</h2>
            <p className="text-sm text-green-700">Dein Konto ist verifiziert. Du kannst jetzt Buchungen durchführen.</p>
          </div>
        )}

        {/* Status: Ausstehend */}
        {status === 'pending' && (
          <div className="rounded-xl border-2 border-yellow-200 bg-yellow-50 p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="font-heading font-bold text-yellow-800 text-lg mb-2">Wird geprüft</h2>
            <p className="text-sm text-yellow-700">
              Deine Dokumente werden geprüft. Dies dauert in der Regel wenige Stunden.
              Du erhältst eine Benachrichtigung, sobald dein Konto freigeschaltet ist.
            </p>
          </div>
        )}

        {/* Status: Abgelehnt */}
        {status === 'rejected' && (
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-6 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h2 className="font-heading font-bold text-red-800 mb-1">Verifizierung abgelehnt</h2>
                <p className="text-sm text-red-700">
                  Deine Dokumente konnten nicht verifiziert werden. Bitte lade sie erneut hoch.
                  Achte darauf, dass beide Seiten gut lesbar und vollständig sichtbar sind.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Upload-Formular (bei none oder rejected) */}
        {(status === 'none' || status === 'rejected') && (
          <div className="space-y-6">
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
              <p className="text-sm text-blue-800">
                <strong>Warum ist das nötig?</strong> Für die Sicherheit unserer Kameras verifizieren wir alle Kunden
                vor der ersten Buchung. Lade bitte die Vorder- und Rückseite deines Personalausweises oder Reisepasses hoch.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                {success}
              </div>
            )}

            <div>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-accent-blue hover:bg-blue-50/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {previews.length === 2 ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-heading font-semibold text-brand-steel mb-2">Vorderseite</p>
                      <img src={previews[0]} alt="Vorderseite" className="max-h-40 mx-auto rounded-lg" />
                    </div>
                    <div>
                      <p className="text-xs font-heading font-semibold text-brand-steel mb-2">Rückseite</p>
                      <img src={previews[1]} alt="Rückseite" className="max-h-40 mx-auto rounded-lg" />
                    </div>
                  </div>
                ) : (
                  <>
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-heading font-semibold text-brand-black mb-1">
                      2 Bilder auswählen
                    </p>
                    <p className="text-sm text-brand-steel">Vorderseite + Rückseite deines Ausweises</p>
                    <p className="text-xs text-brand-muted mt-2">JPG, PNG oder WebP (je max 5 MB)</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              {previews.length === 2 && (
                <button
                  type="button"
                  onClick={() => { setPreviews([]); setFiles([]); if (fileRef.current) fileRef.current.value = ''; }}
                  className="text-xs text-brand-steel hover:text-brand-black mt-2 underline"
                >
                  Andere Bilder wählen
                </button>
              )}
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading || files.length !== 2}
              className="w-full sm:w-auto px-8 py-3 bg-accent-blue text-white font-heading font-semibold rounded-xl hover:bg-accent-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Wird hochgeladen…
                </>
              ) : (
                'Ausweis hochladen'
              )}
            </button>

            <p className="text-xs text-brand-muted">
              Deine Dokumente werden verschlüsselt gespeichert und nur von unserem Team zur Verifizierung eingesehen.
              Nach erfolgreicher Prüfung werden sie nicht mehr benötigt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

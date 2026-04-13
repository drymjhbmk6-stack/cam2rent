'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/components/AuthProvider';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

export default function VerifizierungPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<'none' | 'pending' | 'verified' | 'rejected'>('none');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login?redirect=/konto/verifizierung'); return; }

    const supabase = createAuthBrowserClient();
    supabase
      .from('profiles')
      .select('verification_status')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const s = data?.verification_status ?? 'none';
        setStatus(s);
        if (s === 'verified') router.push('/konto/uebersicht');
      });
  }, [user, authLoading, router]);

  function handleFile(side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Datei zu groß (max. 5 MB).');
      return;
    }

    const url = URL.createObjectURL(file);
    if (side === 'front') {
      setFrontFile(file);
      setFrontPreview(url);
    } else {
      setBackFile(file);
      setBackPreview(url);
    }
    setError('');
  }

  async function handleUpload() {
    if (!user || !frontFile || !backFile) {
      setError('Bitte lade Vorder- und Rückseite deines Ausweises hoch.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const supabase = createAuthBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Nicht eingeloggt.');

      const formData = new FormData();
      formData.append('front', frontFile);
      formData.append('back', backFile);

      const res = await fetch('/api/upload-id', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload fehlgeschlagen.');

      setStatus('pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-12">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-10 max-w-lg w-full">

        {/* Bereits pending */}
        {status === 'pending' && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8 text-amber-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
              Ausweis wird geprüft
            </h1>
            <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-6">
              Dein Ausweis wurde hochgeladen und wird von uns geprüft. Das dauert in der Regel nur wenige Stunden.
              Du erhältst eine Benachrichtigung sobald dein Konto freigeschaltet ist.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/kameras" className="px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn text-center">
                Kameras ansehen
              </Link>
              <Link href="/konto/uebersicht" className="px-6 py-3 border border-brand-border dark:border-white/10 text-brand-black dark:text-white font-heading font-semibold text-sm rounded-btn text-center">
                Mein Konto
              </Link>
            </div>
          </div>
        )}

        {/* Rejected */}
        {status === 'rejected' && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8 text-status-error">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
              Ausweis abgelehnt
            </h1>
            <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-4">
              Dein Ausweis konnte leider nicht verifiziert werden. Bitte lade ein neues, gut lesbares Foto hoch.
            </p>
            <button
              onClick={() => setStatus('none')}
              className="px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn"
            >
              Erneut hochladen
            </button>
          </div>
        )}

        {/* Upload-Formular */}
        {status === 'none' && (
          <>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-accent-blue-soft dark:bg-accent-blue/20 flex items-center justify-center mx-auto mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8 text-accent-blue">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                </svg>
              </div>
              <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
                Ausweis verifizieren
              </h1>
              <p className="font-body text-sm text-brand-steel dark:text-gray-400">
                Für deine Sicherheit und die unserer Geräte benötigen wir einmalig ein Foto deines Ausweises.
                Deine Daten werden vertraulich behandelt.
              </p>
            </div>

            {/* Vorderseite */}
            <div className="mb-4">
              <label className="block text-sm font-heading font-semibold text-brand-black dark:text-white mb-2">
                Vorderseite
              </label>
              <input ref={frontRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => handleFile('front', e)} />
              <button
                onClick={() => frontRef.current?.click()}
                className="w-full h-36 rounded-xl border-2 border-dashed border-brand-border dark:border-white/10 hover:border-accent-blue dark:hover:border-accent-blue transition-colors flex items-center justify-center overflow-hidden"
              >
                {frontPreview ? (
                  <Image src={frontPreview} alt="Vorderseite" width={320} height={200} className="object-contain max-h-full" />
                ) : (
                  <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-1 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="text-sm font-body text-brand-muted">Foto hochladen</span>
                  </div>
                )}
              </button>
            </div>

            {/* Rückseite */}
            <div className="mb-6">
              <label className="block text-sm font-heading font-semibold text-brand-black dark:text-white mb-2">
                Rückseite
              </label>
              <input ref={backRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => handleFile('back', e)} />
              <button
                onClick={() => backRef.current?.click()}
                className="w-full h-36 rounded-xl border-2 border-dashed border-brand-border dark:border-white/10 hover:border-accent-blue dark:hover:border-accent-blue transition-colors flex items-center justify-center overflow-hidden"
              >
                {backPreview ? (
                  <Image src={backPreview} alt="Rückseite" width={320} height={200} className="object-contain max-h-full" />
                ) : (
                  <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-1 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="text-sm font-body text-brand-muted">Foto hochladen</span>
                  </div>
                )}
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-status-error mb-4">
                {error}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading || !frontFile || !backFile}
              className="w-full py-3.5 bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Wird hochgeladen…
                </>
              ) : (
                'Ausweis hochladen'
              )}
            </button>

            <p className="text-xs text-brand-muted dark:text-gray-500 text-center mt-4">
              Akzeptiert: JPG, PNG, WebP (max. 5 MB).
              Deine Daten werden verschlüsselt gespeichert und nur zur Verifizierung verwendet.
            </p>

            <div className="mt-6 pt-4 border-t border-brand-border dark:border-white/10 text-center">
              <Link href="/kameras" className="text-sm font-body text-accent-blue hover:underline">
                Später verifizieren — erstmal Kameras ansehen
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

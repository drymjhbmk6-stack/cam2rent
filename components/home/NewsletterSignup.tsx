'use client';

import { useState } from 'react';

/**
 * Newsletter-Anmelde-Block fuer die Startseite.
 * Double-Opt-In: Eingabe → Bestaetigungsmail → Klick → aktiv.
 */
export default function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'already' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!accept) {
      setError('Bitte stimme der Verarbeitung zu.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'home' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Anmeldung fehlgeschlagen.');
      setStatus(data.alreadySubscribed ? 'already' : 'success');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="py-14 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <span className="inline-block text-xs font-heading font-bold uppercase tracking-wide bg-white/10 backdrop-blur px-3 py-1 rounded-full mb-4">
          📬 Newsletter
        </span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl mb-3">
          Sei zuerst dabei
        </h2>
        <p className="font-body text-sm sm:text-base text-white/80 max-w-xl mx-auto mb-7">
          Neue Kameras, saisonale Aktionen und gelegentlich ein exklusiver Rabatt-Code — nichts Spam, nur das Gute.
        </p>

        {status === 'success' && (
          <div className="max-w-md mx-auto bg-emerald-500/15 border border-emerald-400/40 rounded-xl p-5">
            <p className="font-heading font-bold text-emerald-200 mb-1">Fast geschafft!</p>
            <p className="font-body text-sm text-emerald-100/90">
              Wir haben dir gerade eine Bestätigungsmail geschickt. Bitte klicke den Link darin — danach bist du dabei.
            </p>
          </div>
        )}

        {status === 'already' && (
          <div className="max-w-md mx-auto bg-blue-500/15 border border-blue-400/40 rounded-xl p-5">
            <p className="font-body text-sm text-blue-100">
              Diese Adresse ist schon angemeldet — danke, dass du dabei bist!
            </p>
          </div>
        )}

        {status === 'idle' && (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                className="flex-1 px-4 py-3 rounded-btn bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-accent-blue text-base"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-accent-blue hover:bg-accent-blue/90 text-white font-heading font-semibold rounded-btn disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {submitting ? 'Sendet…' : 'Anmelden'}
              </button>
            </div>

            <label className="flex items-start gap-2 mt-3 text-left cursor-pointer">
              <input
                type="checkbox"
                checked={accept}
                onChange={(e) => setAccept(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-accent-blue flex-shrink-0"
              />
              <span className="text-xs font-body text-white/70 leading-relaxed">
                Ich möchte den Cam2Rent-Newsletter erhalten und stimme der Verarbeitung meiner E-Mail-Adresse zu diesem Zweck zu. Abmeldung jederzeit per Link in jeder Mail. Details in der{' '}
                <a href="/datenschutz" target="_blank" className="underline hover:text-white">
                  Datenschutzerklärung
                </a>
                .
              </span>
            </label>

            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          </form>
        )}

        {status === 'error' && (
          <div className="max-w-md mx-auto">
            <p className="text-sm text-red-300 mb-3">{error || 'Etwas ist schiefgelaufen.'}</p>
            <button
              onClick={() => setStatus('idle')}
              className="px-5 py-2 bg-white/10 hover:bg-white/20 rounded-btn text-sm font-body"
            >
              Nochmal versuchen
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

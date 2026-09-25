'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Choice = 'will_return' | 'please_bill';

/**
 * Rückmeldung des Kunden auf die Nachsende-Mail. Der Link aus der Mail wählt
 * die Antwort nur vor — gespeichert wird erst beim Klick auf „Bestätigen"
 * (Link-Scanner in Mailprogrammen öffnen Links sonst automatisch).
 */
export default function RueckgabeBestaetigenClient() {
  const params = useSearchParams();
  const bookingId = params.get('b') ?? '';
  const token = params.get('t') ?? '';
  const preset = params.get('c');
  const [choice, setChoice] = useState<Choice>(preset === 'please_bill' ? 'please_bill' : 'will_return');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit() {
    setState('sending');
    setError('');
    try {
      const res = await fetch('/api/return-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, t: token, choice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Das hat leider nicht geklappt.');
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das hat leider nicht geklappt.');
      setState('error');
    }
  }

  const invalid = !bookingId || !token;

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {invalid ? (
          <>
            <h1 className="font-heading text-xl font-bold mb-2">Link unvollständig</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Bitte öffne den Link direkt aus unserer E-Mail oder melde dich einfach bei uns.
            </p>
          </>
        ) : state === 'done' ? (
          <>
            <h1 className="font-heading text-xl font-bold mb-2">Danke für deine Rückmeldung!</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {choice === 'will_return'
                ? 'Wir haben vermerkt, dass du die Teile zurückschickst. Sobald sie bei uns sind, ist alles erledigt.'
                : 'Wir haben vermerkt, dass du die Teile nicht mehr hast. Du bekommst von uns eine Rechnung für den Ersatz per E-Mail.'}
            </p>
            <Link href="/konto/buchungen" className="mt-5 inline-block text-sm font-semibold text-[#FF5C00]">
              Zu meinen Buchungen →
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-heading text-xl font-bold mb-1">Rückmeldung zu deiner Rückgabe</h1>
            <p className="text-sm text-gray-500 mb-5">Buchung {bookingId}</p>

            <div className="flex flex-col gap-3">
              {([
                ['will_return', 'Gelesen — ich schicke die Teile zurück'],
                ['please_bill', 'Ich habe die Teile nicht mehr — bitte in Rechnung stellen'],
              ] as [Choice, string][]).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer text-sm ${
                    choice === value ? 'border-[#FF5C00] bg-orange-50 dark:bg-orange-950/30' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="choice"
                    checked={choice === value}
                    onChange={() => setChoice(value)}
                    className="mt-0.5"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {state === 'error' && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <button
              onClick={submit}
              disabled={state === 'sending'}
              className="mt-5 w-full rounded-xl bg-[#0A0A0A] px-4 py-3 text-base font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {state === 'sending' ? 'Wird gesendet…' : 'Bestätigen'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

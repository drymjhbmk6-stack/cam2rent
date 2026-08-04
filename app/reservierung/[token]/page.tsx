'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useCart, type CartItem } from '@/components/CartProvider';

type State = 'loading' | 'login' | 'wrong_user' | 'expired' | 'notfound' | 'error' | 'redirecting';

export default function ReservierungPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { user, loading } = useAuth();
  const { addItem, clearCart } = useCart();
  const router = useRouter();
  const [state, setState] = useState<State>('loading');
  const ranRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setState('login');
      return;
    }
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/reservierung/${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (res.status === 401) { setState('login'); return; }
        if (res.status === 403) { setState('wrong_user'); return; }
        if (res.status === 410) { setState('expired'); return; }
        if (res.status === 404) { setState('notfound'); return; }
        if (!res.ok) { setState('error'); return; }

        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length === 0) { setState('error'); return; }

        // Reservierte Auswahl in den Warenkorb legen (bestehenden ersetzen —
        // der Kunde ist hier, um genau diese Reservierung abzuschliessen).
        clearCart();
        for (const it of items) {
          const cartItem: CartItem = { id: crypto.randomUUID(), ...it };
          addItem(cartItem);
        }
        setState('redirecting');
        router.push('/checkout');
      } catch {
        setState('error');
      }
    })();
  }, [loading, user, token, addItem, clearCart, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        {(state === 'loading' || state === 'redirecting') && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
            <p className="font-body text-brand-steel">Deine Reservierung wird geladen…</p>
          </>
        )}

        {state === 'login' && (
          <>
            <h1 className="font-heading text-2xl font-bold text-brand-black dark:text-white mb-2">Bitte einloggen</h1>
            <p className="font-body text-brand-steel mb-6">
              Melde dich mit deinem Konto an, um deine reservierte Ausrüstung zu sehen und die Buchung abzuschließen.
            </p>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/reservierung/${token}`)}`}
              className="inline-block px-6 py-3 rounded-[10px] bg-brand-primary text-white font-heading font-semibold text-sm hover:opacity-90 transition"
            >
              Zum Login
            </Link>
          </>
        )}

        {state === 'wrong_user' && (
          <>
            <h1 className="font-heading text-2xl font-bold text-brand-black dark:text-white mb-2">Falsches Konto</h1>
            <p className="font-body text-brand-steel">
              Diese Reservierung gehört zu einem anderen Kundenkonto. Bitte melde dich mit dem Konto an, für das
              reserviert wurde.
            </p>
          </>
        )}

        {state === 'expired' && (
          <>
            <h1 className="font-heading text-2xl font-bold text-brand-black dark:text-white mb-2">Reservierung abgelaufen</h1>
            <p className="font-body text-brand-steel mb-6">
              Diese Reservierung ist nicht mehr gültig (die 48-Stunden-Frist ist abgelaufen oder sie wurde bereits
              abgeschlossen). Du kannst deine Ausrüstung aber jederzeit direkt im Shop buchen.
            </p>
            <Link
              href="/kameras"
              className="inline-block px-6 py-3 rounded-[10px] bg-brand-primary text-white font-heading font-semibold text-sm hover:opacity-90 transition"
            >
              Zu den Kameras
            </Link>
          </>
        )}

        {state === 'notfound' && (
          <>
            <h1 className="font-heading text-2xl font-bold text-brand-black dark:text-white mb-2">Nicht gefunden</h1>
            <p className="font-body text-brand-steel">Diese Reservierung existiert nicht (mehr).</p>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 className="font-heading text-2xl font-bold text-brand-black dark:text-white mb-2">Etwas ist schiefgelaufen</h1>
            <p className="font-body text-brand-steel">
              Deine Reservierung konnte nicht geladen werden. Bitte versuche es später erneut oder kontaktiere uns.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

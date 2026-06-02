'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createAuthBrowserClient } from '@/lib/supabase-auth';
import { useAutoLogout } from '@/hooks/useAutoLogout';

// 60 Minuten Inaktivität für Shop-Kunden
const SHOP_TIMEOUT_MS = 60 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createAuthBrowserClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      // claim-guest-bookings wurde Sweep 6 deaktiviert (Account-Hijack-Vehikel).
      // Gastbuchungen werden jetzt vom Admin manuell zugewiesen.
      //
      // Login-Verlauf wird NICHT hier protokolliert: 'SIGNED_IN' feuert bei
      // @supabase/ssr auch bei Session-Wiederherstellung/Tab-Fokus → Phantom-
      // Logins. Stattdessen ruft jeder echte signInWithPassword-Pfad direkt
      // recordCustomerLogin() auf (siehe lib/supabase-auth.ts).
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createAuthBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  }, []);

  // Auto-Logout nach Inaktivität (nur wenn eingeloggt)
  useAutoLogout({
    timeoutMs: SHOP_TIMEOUT_MS,
    onLogout: signOut,
    enabled: !!user,
  });

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

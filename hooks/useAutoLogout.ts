'use client';

import { useEffect, useRef, useCallback } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

interface UseAutoLogoutOptions {
  timeoutMs: number;
  onLogout: () => void;
  onWarning?: () => void;
  warningBeforeMs?: number;
  enabled?: boolean;
}

/**
 * Hook für automatisches Ausloggen nach Inaktivität.
 * Trackt Maus, Tastatur, Touch und Scroll-Events.
 */
export function useAutoLogout({
  timeoutMs,
  onLogout,
  onWarning,
  warningBeforeMs = 60_000,
  enabled = true,
}: UseAutoLogoutOptions) {
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningFiredRef = useRef(false);

  const resetTimers = useCallback(() => {
    if (!enabled) return;

    warningFiredRef.current = false;

    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    // Warnung kurz vor Ablauf
    if (onWarning && warningBeforeMs < timeoutMs) {
      warningTimerRef.current = setTimeout(() => {
        warningFiredRef.current = true;
        onWarning();
      }, timeoutMs - warningBeforeMs);
    }

    // Logout
    logoutTimerRef.current = setTimeout(() => {
      onLogout();
    }, timeoutMs);
  }, [timeoutMs, onLogout, onWarning, warningBeforeMs, enabled]);

  useEffect(() => {
    if (!enabled) return;

    resetTimers();

    const handleActivity = () => resetTimers();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    // Auch bei Tab-Wechsel prüfen
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Prüfen ob während der Abwesenheit die Zeit abgelaufen ist
        const lastActivity = sessionStorage.getItem('cam2rent_last_activity');
        if (lastActivity) {
          const elapsed = Date.now() - parseInt(lastActivity, 10);
          if (elapsed >= timeoutMs) {
            onLogout();
            return;
          }
        }
        resetTimers();
      }
    };

    // Aktivitäts-Zeitstempel speichern (für Tab-Wechsel-Prüfung)
    const saveTimestamp = () => {
      sessionStorage.setItem('cam2rent_last_activity', Date.now().toString());
    };
    const activityInterval = setInterval(saveTimestamp, 30_000);
    saveTimestamp();

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(activityInterval);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [enabled, resetTimers, timeoutMs, onLogout]);
}

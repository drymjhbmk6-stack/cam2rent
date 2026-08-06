'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Globales Admin-Feedback-System (Schritt 5 der Admin-Modernisierung):
 *  - `useToast()` → success/info/warning/error-Toasts, optional mit Aktion
 *    (z.B. „Rückgängig"). aria-live für Screenreader.
 *  - `useConfirm()` → `confirm(opts): Promise<boolean>` als gestylter Dialog mit
 *    Fokus-Trap/ESC — ersetzt das native `confirm()`.
 *
 * Rein additiv: Seiten, die noch `alert()`/`confirm()` nutzen, laufen unverändert
 * weiter. Token-basiert (folgt Light/Dark). Der bestehende `GlobalErrorToast`
 * (uncaught-Fehler) bleibt separat bestehen.
 */

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  kind?: ToastKind;
  message: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastEntry extends Required<Omit<ToastOptions, 'action'>> {
  id: number;
  action?: ToastAction;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  toast: (opts: ToastOptions | string) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const ACCENT: Record<ToastKind, string> = {
  success: '#22c55e',
  error: 'var(--admin-danger)',
  info: 'var(--admin-accent)',
  warning: '#f59e0b',
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [confirmState, setConfirmState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (opts: ToastOptions | string) => {
      const o: ToastOptions = typeof opts === 'string' ? { message: opts } : opts;
      const kind = o.kind ?? 'info';
      const id = ++idRef.current;
      const duration = o.duration ?? (kind === 'error' ? 6000 : 4000);
      setToasts((prev) => [...prev.slice(-3), { id, kind, message: o.message, duration, action: o.action }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ opts, resolve });
      }),
    [],
  );

  const closeConfirm = useCallback(
    (result: boolean) => {
      setConfirmState((cur) => {
        cur?.resolve(result);
        return null;
      });
    },
    [],
  );

  // Timer-Aufräumen beim Unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts */}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          bottom: 'calc(16px + env(safe-area-inset-bottom))',
          right: 16,
          zIndex: 9990,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 'min(92vw, 380px)',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '11px 13px',
              borderRadius: 12,
              background: 'var(--admin-modal-bg)',
              border: '1px solid var(--admin-border)',
              borderLeft: `3px solid ${ACCENT[t.kind]}`,
              boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
              color: 'var(--admin-text)',
              fontSize: 14,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--admin-accent)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Schließen"
              style={{ background: 'transparent', border: 'none', color: 'var(--admin-muted-2)', cursor: 'pointer', flexShrink: 0, lineHeight: 1, fontSize: 16 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Confirm-Dialog */}
      {confirmState && (
        <ConfirmDialog opts={confirmState.opts} onClose={closeConfirm} />
      )}
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (v: boolean) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 20);
    return () => {
      clearTimeout(t);
      prevFocusRef.current?.focus?.();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose(false);
      return;
    }
    if (e.key === 'Tab') {
      // Einfacher Fokus-Trap zwischen den beiden Buttons.
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button');
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      onClick={() => onClose(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9995,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={opts.title ?? 'Bestätigen'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--admin-modal-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          padding: 20,
          color: 'var(--admin-text)',
        }}
      >
        {opts.title && (
          <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: 'var(--admin-heading)' }}>{opts.title}</h2>
        )}
        <p style={{ margin: 0, fontSize: 14, color: 'var(--admin-text-2)', whiteSpace: 'pre-line' }}>{opts.message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={() => onClose(false)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              background: 'var(--admin-secondary-bg)',
              border: '1px solid var(--admin-border)',
              color: 'var(--admin-text)',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {opts.cancelLabel ?? 'Abbrechen'}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => onClose(true)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              background: opts.danger ? 'var(--admin-danger)' : 'var(--admin-accent)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {opts.confirmLabel ?? 'Bestätigen'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Toast-Ausgabe. `toast('Text')` oder `toast({ kind, message, action })`.
 *  Rückgabe-Objekt ist memoisiert (stabile Referenzen) → sicher in
 *  useCallback/useEffect-Dependency-Arrays. */
export function useToast() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useToast muss innerhalb von <FeedbackProvider> verwendet werden.');
  const { toast } = ctx;
  return useMemo(
    () => ({
      toast,
      success: (message: string, action?: ToastAction) => toast({ kind: 'success', message, action }),
      error: (message: string) => toast({ kind: 'error', message }),
      info: (message: string) => toast({ kind: 'info', message }),
      warning: (message: string) => toast({ kind: 'warning', message }),
    }),
    [toast],
  );
}

/** Bestätigungs-Dialog. `const confirm = useConfirm(); if (await confirm({...})) {…}` */
export function useConfirm() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useConfirm muss innerhalb von <FeedbackProvider> verwendet werden.');
  return ctx.confirm;
}

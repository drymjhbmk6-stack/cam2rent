'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Barrierearmes Modal-Primitiv (Schritt 6): `role="dialog"` + `aria-modal`,
 * Fokus-Trap, ESC + Backdrop-Klick schließen, Fokus-Restore beim Schließen.
 * Token-basiert (Light/Dark). Basis für die hand-gebauten Modals in Schritt 8.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 520,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  closeOnBackdrop?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const focusable = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? dialogRef.current)?.focus();
    }, 20);
    return () => {
      clearTimeout(t);
      prevFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
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
      onClick={() => closeOnBackdrop && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9994,
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
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--admin-modal-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          color: 'var(--admin-text)',
        }}
      >
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--admin-border)' }}>
            <h2 className="font-heading" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--admin-heading)' }}>
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Schließen" style={{ background: 'transparent', border: 'none', color: 'var(--admin-muted-2)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>
              ×
            </button>
          </div>
        )}
        <div style={{ padding: 18 }}>{children}</div>
        {footer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--admin-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

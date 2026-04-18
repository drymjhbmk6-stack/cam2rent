'use client';

import { useState, useEffect, useRef } from 'react';

interface NotifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  productId: string;
  source?: 'card' | 'detail';
}

export default function NotifyModal({ isOpen, onClose, productName, productId, source }: NotifyModalProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSubmitted(false);
      setEmail('');
      setErrorMsg(null);
      setSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, email, source: source ?? 'card' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error || 'Speichern fehlgeschlagen. Bitte später erneut versuchen.');
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setErrorMsg('Netzwerkfehler. Bitte später erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notify-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-brand-dark rounded-card shadow-2xl w-full max-w-md p-6">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-md text-brand-muted dark:text-gray-400 hover:text-brand-black dark:hover:text-white hover:bg-brand-bg dark:hover:bg-white/10 transition-colors"
          aria-label="Modal schließen"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {!submitted ? (
          <>
            {/* Header */}
            <div className="flex items-start gap-3 mb-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-blue-soft dark:bg-accent-blue/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth={2} className="w-5 h-5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>
              <div>
                <h2 id="notify-modal-title" className="font-heading font-bold text-lg text-brand-black dark:text-white">
                  Benachrichtige mich
                </h2>
                <p className="text-sm font-body text-brand-steel dark:text-gray-400 mt-0.5">
                  Sobald <span className="font-medium text-brand-black dark:text-white">{productName}</span> verfügbar ist, informieren wir dich.
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <label htmlFor="notify-email" className="block text-sm font-body font-medium text-brand-text dark:text-gray-300 mb-1.5">
                Deine E-Mail-Adresse
              </label>
              <input
                ref={inputRef}
                id="notify-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                required
                className="w-full px-4 py-2.5 border border-brand-border dark:border-white/10 rounded-[10px] font-body text-sm text-brand-black dark:text-white bg-white dark:bg-brand-black placeholder:text-brand-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition mb-4"
              />
              {errorMsg && (
                <p className="text-xs font-body text-status-error mb-3" role="alert">
                  {errorMsg}
                </p>
              )}
              <button
                type="submit"
                className="w-full px-4 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark dark:hover:bg-accent-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!email || submitting}
              >
                {submitting ? 'Wird gespeichert…' : 'Benachrichtigen'}
              </button>
              <p className="text-xs font-body text-brand-muted dark:text-gray-500 mt-3 text-center">
                Keine Werbung. Nur eine E-Mail, wenn das Produkt verfügbar ist.
              </p>
            </form>
          </>
        ) : (
          /* Success state */
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5} className="w-7 h-7" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-2">Eingetragen!</h2>
            <p className="text-sm font-body text-brand-steel dark:text-gray-400 mb-5">
              Wir schicken dir eine E-Mail, sobald <span className="font-medium text-brand-black dark:text-white">{productName}</span> verfügbar ist.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-brand-bg dark:bg-brand-black text-brand-text dark:text-gray-300 font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-border dark:hover:bg-white/10 transition-colors"
            >
              Schließen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

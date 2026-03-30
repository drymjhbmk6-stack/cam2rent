'use client';

import { useState, useEffect, useRef } from 'react';

interface NotifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
}

export default function NotifyModal({ isOpen, onClose, productName }: NotifyModalProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSubmitted(false);
      setEmail('');
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    // UI only – keine Backend-Logik in Session 2
    setSubmitted(true);
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
      <div className="relative bg-white rounded-card shadow-2xl w-full max-w-md p-6">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-md text-brand-muted hover:text-brand-black hover:bg-brand-bg transition-colors"
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
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-blue-soft flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth={2} className="w-5 h-5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>
              <div>
                <h2 id="notify-modal-title" className="font-heading font-bold text-lg text-brand-black">
                  Benachrichtige mich
                </h2>
                <p className="text-sm font-body text-brand-steel mt-0.5">
                  Sobald <span className="font-medium text-brand-black">{productName}</span> wieder verfügbar ist, informieren wir dich.
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <label htmlFor="notify-email" className="block text-sm font-body font-medium text-brand-text mb-1.5">
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
                className="w-full px-4 py-2.5 border border-brand-border rounded-[10px] font-body text-sm text-brand-black placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition mb-4"
              />
              <button
                type="submit"
                className="w-full px-4 py-2.5 bg-brand-black text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!email}
              >
                Benachrichtigen
              </button>
              <p className="text-xs font-body text-brand-muted mt-3 text-center">
                Keine Werbung. Nur eine E-Mail, wenn das Produkt verfügbar ist.
              </p>
            </form>
          </>
        ) : (
          /* Success state */
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5} className="w-7 h-7" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="font-heading font-bold text-lg text-brand-black mb-2">Eingetragen!</h2>
            <p className="text-sm font-body text-brand-steel mb-5">
              Wir schicken dir eine E-Mail, sobald <span className="font-medium text-brand-black">{productName}</span> wieder verfügbar ist.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-brand-bg text-brand-text font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-border transition-colors"
            >
              Schließen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';

type PreviewAttachment = { key: 'invoice' | 'creditnote'; label: string };

/**
 * Vorschau-Fenster vor dem Senden einer Storno-Mail.
 * Zeigt die gerenderte Kunden-E-Mail (sandboxed iframe) + Buttons, um die
 * angehaengten PDFs (Rechnung / Stornierungsbeleg) im PDF-Viewer zu oeffnen,
 * + ein Haekchen „Rechnung anhaengen". Confirm meldet die Anhang-Wahl zurueck.
 */
export default function CancellationPreviewModal({
  bookingId,
  title,
  confirmLabel,
  busy,
  refundAmount,
  reason,
  creditNoteUsesAmount,
  onConfirm,
  onClose,
  closeLabel = 'Zurück',
}: {
  bookingId: string;
  title: string;
  confirmLabel: string;
  busy: boolean;
  /** Storno: gewählter Betrag. Resend: weglassen → Server nutzt gespeicherten. */
  refundAmount?: number;
  reason?: string;
  /** true (Storno): CN-Vorschau bekommt amount/reason als Query. */
  creditNoteUsesAmount: boolean;
  onConfirm: (attachInvoice: boolean) => void;
  onClose: () => void;
  closeLabel?: string;
}) {
  const [attachInvoice, setAttachInvoice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [emailHtml, setEmailHtml] = useState('');
  const [attachments, setAttachments] = useState<PreviewAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}/cancellation-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(refundAmount != null ? { refund_amount: refundAmount } : {}),
          refund_note: undefined,
          attach_invoice: attachInvoice,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Vorschau fehlgeschlagen.'); return; }
      setEmailHtml(d.emailHtml ?? '');
      setAttachments(Array.isArray(d.attachments) ? d.attachments : []);
    } catch {
      setError('Netzwerkfehler bei der Vorschau.');
    } finally {
      setLoading(false);
    }
  }, [bookingId, refundAmount, attachInvoice]);

  useEffect(() => { load(); }, [load]);

  function openPdf(att: PreviewAttachment) {
    let inner: string;
    if (att.key === 'invoice') {
      inner = `/api/invoice/${bookingId}`;
    } else {
      inner = `/api/admin/booking/${bookingId}/credit-note-preview`;
      if (creditNoteUsesAmount) {
        const params = new URLSearchParams();
        if (refundAmount != null) params.set('amount', String(refundAmount));
        if (reason) params.set('reason', reason);
        const qs = params.toString();
        if (qs) inner += `?${qs}`;
      }
    }
    const viewer = `/admin/pdf-viewer?u=${encodeURIComponent(inner)}&t=${encodeURIComponent(att.label)}`;
    window.open(viewer, '_blank', 'noopener');
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">{title}</h3>
        <p className="text-sm font-body text-brand-muted mb-3">Vorschau der E-Mail an den Kunden. Erst danach wird gesendet.</p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2 mb-3">{error}</p>
        )}

        {/* E-Mail-Vorschau */}
        <div className="border border-brand-border dark:border-slate-600 rounded-xl overflow-hidden mb-3" style={{ height: 360 }}>
          {loading ? (
            <div className="w-full h-full flex items-center justify-center text-sm text-brand-muted">Vorschau wird geladen…</div>
          ) : (
            <iframe title="E-Mail-Vorschau" sandbox="" srcDoc={emailHtml} className="w-full h-full bg-white" />
          )}
        </div>

        {/* Anhänge */}
        <div className="mb-3">
          <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-2">Anhänge ansehen</p>
          {attachments.length === 0 ? (
            <p className="text-sm text-brand-muted">Keine PDF-Anhänge.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <button
                  key={att.key}
                  onClick={() => openPdf(att)}
                  className="px-3 py-1.5 text-sm font-heading font-semibold text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 rounded-btn hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors"
                >
                  📄 {att.label} ansehen
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Rechnung anhängen */}
        <label className="flex items-center gap-2 text-sm font-body text-brand-black dark:text-slate-200 cursor-pointer mb-5">
          <input
            type="checkbox"
            checked={attachInvoice}
            onChange={(e) => setAttachInvoice(e.target.checked)}
            className="accent-red-600"
          />
          Rechnung als PDF anhängen
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-brand-bg transition-colors disabled:opacity-40">
            {closeLabel}
          </button>
          <button onClick={() => onConfirm(attachInvoice)} disabled={busy || loading}
            className="px-5 py-2 text-sm font-heading font-semibold bg-red-600 text-white rounded-btn hover:bg-red-700 transition-colors disabled:opacity-40">
            {busy ? 'Wird gesendet…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

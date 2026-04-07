'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface EmailEntry {
  id: string;
  booking_id: string | null;
  customer_email: string;
  email_type: string;
  subject: string | null;
  sent_at: string;
  status: 'sent' | 'failed';
  resend_message_id: string | null;
  error_message: string | null;
}

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  booking_confirmation: { label: 'Buchungsbestätigung', color: '#06b6d4', bg: '#06b6d414' },
  booking_admin: { label: 'Buchung (Admin)', color: '#8b5cf6', bg: '#8b5cf614' },
  cancellation_customer: { label: 'Stornierung', color: '#ef4444', bg: '#ef444414' },
  cancellation_admin: { label: 'Stornierung (Admin)', color: '#ef4444', bg: '#ef444414' },
  shipping_confirmation: { label: 'Versandbestätigung', color: '#10b981', bg: '#10b98114' },
  damage_report_customer: { label: 'Schadensmeldung', color: '#f97316', bg: '#f9731614' },
  damage_report_admin: { label: 'Schadensmeldung (Admin)', color: '#f97316', bg: '#f9731614' },
  damage_resolution: { label: 'Schadensauflösung', color: '#f59e0b', bg: '#f59e0b14' },
  referral_reward: { label: 'Empfehlung', color: '#ec4899', bg: '#ec489914' },
  message_admin: { label: 'Nachricht (Admin)', color: '#6366f1', bg: '#6366f114' },
  message_customer: { label: 'Nachricht (Kunde)', color: '#6366f1', bg: '#6366f114' },
  extension_confirmation: { label: 'Verlängerung', color: '#06b6d4', bg: '#06b6d414' },
  review_request: { label: 'Bewertungsanfrage', color: '#f59e0b', bg: '#f59e0b14' },
  abandoned_cart: { label: 'Warenkorbabbruch', color: '#94a3b8', bg: '#94a3b814' },
  return_reminder_2d: { label: 'Rückgabe-Erinnerung (2T)', color: '#f59e0b', bg: '#f59e0b14' },
  return_reminder_0d: { label: 'Rückgabe heute', color: '#f97316', bg: '#f9731614' },
  overdue_1d: { label: 'Überfällig (1T)', color: '#ef4444', bg: '#ef444414' },
  overdue_3d: { label: 'Überfällig (3T)', color: '#dc2626', bg: '#dc262614' },
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminEmailLogPage() {
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadEmails();
  }, [page, typeFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadEmails() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/email-log?${params}`);
      const data = await res.json();
      setEmails(data.emails ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadEmails();
  }

  const sentCount = emails.filter((e) => e.status === 'sent').length;
  const failedCount = emails.filter((e) => e.status === 'failed').length;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="font-heading font-bold text-2xl text-brand-black">E-Mail-Protokoll</h1>
          <p className="text-sm font-body text-brand-muted mt-0.5">
            Alle gesendeten E-Mails — {total} Einträge
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-brand-border p-4">
            <p className="text-xs font-body text-brand-muted uppercase tracking-wider mb-1">Gesamt</p>
            <p className="font-heading font-bold text-2xl text-brand-black">{total}</p>
          </div>
          <div className="bg-white rounded-xl border border-brand-border p-4">
            <p className="text-xs font-body text-brand-muted uppercase tracking-wider mb-1">Gesendet</p>
            <p className="font-heading font-bold text-2xl text-green-600">{sentCount}</p>
          </div>
          <div className={`rounded-xl border p-4 ${failedCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-brand-border'}`}>
            <p className="text-xs font-body text-brand-muted uppercase tracking-wider mb-1">Fehlgeschlagen</p>
            <p className={`font-heading font-bold text-2xl ${failedCount > 0 ? 'text-red-600' : 'text-brand-black'}`}>{failedCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-brand-border p-4 mb-6">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider block mb-1">Suche</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="E-Mail, Buchungsnr., Betreff..."
                className="w-full text-sm font-body border border-brand-border rounded-btn px-3 py-2 bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <div>
              <label className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider block mb-1">Typ</label>
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                className="text-sm font-body border border-brand-border rounded-btn px-3 py-2 bg-white text-brand-black"
              >
                <option value="">Alle Typen</option>
                {Object.entries(TYPE_LABELS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider block mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="text-sm font-body border border-brand-border rounded-btn px-3 py-2 bg-white text-brand-black"
              >
                <option value="">Alle</option>
                <option value="sent">Gesendet</option>
                <option value="failed">Fehlgeschlagen</option>
              </select>
            </div>
            <button type="submit" className="px-4 py-2 bg-brand-black text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors">
              Suchen
            </button>
          </form>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-brand-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-brand-muted font-body">Lädt...</div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-brand-muted font-body">Keine E-Mails gefunden.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-bg">
                    <th className="text-left py-3 px-4 font-heading font-semibold text-brand-muted text-xs uppercase tracking-wider">Zeitpunkt</th>
                    <th className="text-left py-3 px-4 font-heading font-semibold text-brand-muted text-xs uppercase tracking-wider">Typ</th>
                    <th className="text-left py-3 px-4 font-heading font-semibold text-brand-muted text-xs uppercase tracking-wider">Empfänger</th>
                    <th className="text-left py-3 px-4 font-heading font-semibold text-brand-muted text-xs uppercase tracking-wider">Betreff</th>
                    <th className="text-left py-3 px-4 font-heading font-semibold text-brand-muted text-xs uppercase tracking-wider">Buchung</th>
                    <th className="text-left py-3 px-4 font-heading font-semibold text-brand-muted text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((email) => {
                    const typeInfo = TYPE_LABELS[email.email_type] ?? { label: email.email_type, color: '#94a3b8', bg: '#94a3b814' };
                    return (
                      <tr key={email.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                        <td className="py-3 px-4 font-body text-brand-steel whitespace-nowrap">
                          {fmtDateTime(email.sent_at)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-heading font-semibold"
                            style={{ color: typeInfo.color, backgroundColor: typeInfo.bg }}
                          >
                            {typeInfo.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-body text-brand-black">
                          {email.customer_email}
                        </td>
                        <td className="py-3 px-4 font-body text-brand-steel max-w-[250px] truncate" title={email.subject ?? ''}>
                          {email.subject || '–'}
                        </td>
                        <td className="py-3 px-4">
                          {email.booking_id ? (
                            <Link href={`/admin/buchungen/${email.booking_id}`} className="font-body text-accent-blue hover:underline text-xs font-semibold">
                              {email.booking_id}
                            </Link>
                          ) : (
                            <span className="text-brand-muted">–</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {email.status === 'sent' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-green-600">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              Gesendet
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-red-600" title={email.error_message ?? ''}>
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                              Fehler
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-brand-border">
              <p className="text-xs font-body text-brand-muted">
                Seite {page} von {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-heading font-semibold border border-brand-border rounded-btn hover:bg-brand-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Zurück
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-heading font-semibold border border-brand-border rounded-btn hover:bg-brand-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Weiter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

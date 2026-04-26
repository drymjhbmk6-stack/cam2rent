'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

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

type ResendEvent =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'complained'
  | 'bounced'
  | 'opened'
  | 'clicked';

interface ResendStatus {
  loading: boolean;
  last_event?: ResendEvent | null;
  bounce?: { message?: string; type?: string; subType?: string } | null;
  error?: string;
  restricted?: boolean;
  hint?: string;
  dashboardUrl?: string;
}

const RESEND_EVENT_LABELS: Record<ResendEvent, { label: string; color: string; hint: string }> = {
  sent: { label: 'Von Resend angenommen', color: '#64748b', hint: 'Resend hat die Mail in die Warteschlange genommen, aber noch nicht an den Empfaenger-Mailserver ausgeliefert.' },
  delivered: { label: 'Zugestellt', color: '#10b981', hint: 'Der Empfaenger-Mailserver hat die Mail angenommen. Kommt sie trotzdem nicht an, hat der Mailprovider (z.B. Outlook) sie still in Junk/Quarantaene geschoben.' },
  delivery_delayed: { label: 'Zustellung verzoegert', color: '#f59e0b', hint: 'Empfaenger-Mailserver hat die Mail temporaer abgelehnt, Resend versucht es erneut.' },
  complained: { label: 'Als Spam markiert', color: '#ef4444', hint: 'Der Empfaenger hat die Mail als Spam gemeldet.' },
  bounced: { label: 'Bounced (unzustellbar)', color: '#ef4444', hint: 'Der Empfaenger-Mailserver hat die Mail dauerhaft abgelehnt — Details unten.' },
  opened: { label: 'Geoeffnet', color: '#10b981', hint: 'Der Empfaenger hat die Mail geoeffnet.' },
  clicked: { label: 'Link angeklickt', color: '#10b981', hint: 'Der Empfaenger hat einen Link angeklickt.' },
};

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  booking_confirmation: { label: 'Buchungsbestätigung', color: '#06b6d4', bg: '#06b6d414' },
  booking_admin: { label: 'Buchung (Admin)', color: '#8b5cf6', bg: '#8b5cf614' },
  cancellation_customer: { label: 'Stornierung', color: '#ef4444', bg: '#ef444414' },
  cancellation_admin: { label: 'Stornierung (Admin)', color: '#ef4444', bg: '#ef444414' },
  auto_cancel: { label: 'Auto-Storno', color: '#ef4444', bg: '#ef444414' },
  auto_cancel_payment: { label: 'Auto-Storno (unbezahlt)', color: '#ef4444', bg: '#ef444414' },
  shipping_confirmation: { label: 'Versandbestätigung', color: '#10b981', bg: '#10b98114' },
  damage_report_customer: { label: 'Schadensmeldung', color: '#f97316', bg: '#f9731614' },
  damage_report_admin: { label: 'Schadensmeldung (Admin)', color: '#f97316', bg: '#f9731614' },
  damage_resolution: { label: 'Schadensauflösung', color: '#f59e0b', bg: '#f59e0b14' },
  referral_reward: { label: 'Empfehlung', color: '#ec4899', bg: '#ec489914' },
  message_admin: { label: 'Nachricht (Admin)', color: '#6366f1', bg: '#6366f114' },
  message_customer: { label: 'Nachricht (Kunde)', color: '#6366f1', bg: '#6366f114' },
  extension_confirmation: { label: 'Verlängerung', color: '#06b6d4', bg: '#06b6d414' },
  review_request: { label: 'Bewertungsanfrage', color: '#f59e0b', bg: '#f59e0b14' },
  review_reward_coupon: { label: 'Bewertungs-Gutschein', color: '#f59e0b', bg: '#f59e0b14' },
  abandoned_cart: { label: 'Warenkorbabbruch', color: '#94a3b8', bg: '#94a3b814' },
  return_reminder_2d: { label: 'Rückgabe-Erinnerung (2T)', color: '#f59e0b', bg: '#f59e0b14' },
  return_reminder_0d: { label: 'Rückgabe heute', color: '#f97316', bg: '#f9731614' },
  overdue_1d: { label: 'Überfällig (1T)', color: '#ef4444', bg: '#ef444414' },
  overdue_3d: { label: 'Überfällig (3T)', color: '#dc2626', bg: '#dc262614' },
  payment_link: { label: 'Zahlungs-Link', color: '#0ea5e9', bg: '#0ea5e914' },
  contract_signed: { label: 'Vertrag unterschrieben', color: '#10b981', bg: '#10b98114' },
  manual_documents: { label: 'Dokumente (manuell)', color: '#8b5cf6', bg: '#8b5cf614' },
  weekly_report: { label: 'Wochenbericht', color: '#06b6d4', bg: '#06b6d414' },
  verification_reminder: { label: 'Verifizierungs-Erinnerung', color: '#f59e0b', bg: '#f59e0b14' },
  verification_auto_cancel: { label: 'Verifizierung: Auto-Storno', color: '#dc2626', bg: '#dc262614' },
  verification_rejected: { label: 'Verifizierung: Abgelehnt', color: '#ef4444', bg: '#ef444414' },
  ugc_approved: { label: 'Kundenmaterial: Freigabe + Gutschein', color: '#10b981', bg: '#10b98114' },
  ugc_featured: { label: 'Kundenmaterial: Feature-Bonus', color: '#9333ea', bg: '#9333ea14' },
  ugc_rejected: { label: 'Kundenmaterial: Absage', color: '#ef4444', bg: '#ef444414' },
  newsletter_confirm: { label: 'Newsletter: Bestätigung', color: '#3b82f6', bg: '#3b82f614' },
  newsletter_campaign: { label: 'Newsletter: Kampagne', color: '#3b82f6', bg: '#3b82f614' },
  newsletter_test: { label: 'Newsletter: Test', color: '#94a3b8', bg: '#94a3b814' },
  test: { label: 'Test-E-Mail', color: '#94a3b8', bg: '#94a3b814' },
};

export default function AdminEmailLogPage() {
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resendStatusMap, setResendStatusMap] = useState<Record<string, ResendStatus>>({});

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

  async function fetchResendStatus(logId: string) {
    setResendStatusMap((prev) => ({ ...prev, [logId]: { loading: true } }));
    try {
      const res = await fetch(`/api/admin/email-log/${logId}/resend-status`);
      const data = await res.json();
      if (!res.ok) {
        setResendStatusMap((prev) => ({
          ...prev,
          [logId]: {
            loading: false,
            error: data.error || 'Abfrage fehlgeschlagen',
            restricted: data.restricted,
            hint: data.hint,
            dashboardUrl: data.dashboardUrl,
          },
        }));
        return;
      }
      setResendStatusMap((prev) => ({
        ...prev,
        [logId]: {
          loading: false,
          last_event: data.last_event,
          bounce: data.bounce,
          dashboardUrl: data.dashboardUrl,
        },
      }));
    } catch {
      setResendStatusMap((prev) => ({ ...prev, [logId]: { loading: false, error: 'Netzwerkfehler' } }));
    }
  }

  function handleExpand(email: EmailEntry) {
    const nextId = expandedId === email.id ? null : email.id;
    setExpandedId(nextId);
    // Beim Aufklappen automatisch den Resend-Zustellstatus nachladen
    if (nextId && email.resend_message_id && !resendStatusMap[email.id]) {
      fetchResendStatus(email.id);
    }
  }

  const sentCount = emails.filter((e) => e.status === 'sent').length;
  const failedCount = emails.filter((e) => e.status === 'failed').length;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <AdminBackLink label="Zurück" />
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
                    const isExpanded = expandedId === email.id;
                    const isFailed = email.status === 'failed';
                    return (
                      <Fragment key={email.id}>
                        <tr
                          onClick={() => handleExpand(email)}
                          className={`border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors cursor-pointer ${isExpanded ? 'bg-brand-bg/40' : ''}`}
                        >
                          <td className="py-3 px-4 font-body text-brand-steel whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {/* Status-Punkt immer links sichtbar — auch wenn Tabelle abgeschnitten ist */}
                              <span
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${isFailed ? 'bg-red-500' : 'bg-green-500'}`}
                                title={isFailed ? 'Fehlgeschlagen' : 'Gesendet'}
                              />
                              {fmtDateTime(email.sent_at)}
                            </div>
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
                              <Link
                                href={`/admin/buchungen/${email.booking_id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-body text-accent-blue hover:underline text-xs font-semibold"
                              >
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
                              <span className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-red-600">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                Fehler
                              </span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-brand-border/50 bg-brand-bg/30">
                            <td colSpan={6} className="py-4 px-6">
                              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs font-body">
                                <div>
                                  <dt className="font-heading font-semibold text-brand-muted uppercase tracking-wider">Empfänger</dt>
                                  <dd className="text-brand-black break-all mt-0.5">{email.customer_email || '–'}</dd>
                                </div>
                                <div>
                                  <dt className="font-heading font-semibold text-brand-muted uppercase tracking-wider">Buchung</dt>
                                  <dd className="text-brand-black mt-0.5">
                                    {email.booking_id ? (
                                      <Link href={`/admin/buchungen/${email.booking_id}`} className="text-accent-blue hover:underline">
                                        {email.booking_id}
                                      </Link>
                                    ) : '–'}
                                  </dd>
                                </div>
                                <div className="sm:col-span-2">
                                  <dt className="font-heading font-semibold text-brand-muted uppercase tracking-wider">Betreff</dt>
                                  <dd className="text-brand-black break-words mt-0.5">{email.subject || '–'}</dd>
                                </div>
                                <div>
                                  <dt className="font-heading font-semibold text-brand-muted uppercase tracking-wider">Status</dt>
                                  <dd className={`font-heading font-semibold mt-0.5 ${isFailed ? 'text-red-600' : 'text-green-600'}`}>
                                    {isFailed ? 'Fehlgeschlagen' : 'Gesendet'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="font-heading font-semibold text-brand-muted uppercase tracking-wider">Resend-ID</dt>
                                  <dd className="text-brand-steel break-all mt-0.5 font-mono">{email.resend_message_id || '–'}</dd>
                                </div>
                                {email.resend_message_id && (() => {
                                  const rs = resendStatusMap[email.id];
                                  const eventInfo = rs?.last_event ? RESEND_EVENT_LABELS[rs.last_event] : null;
                                  return (
                                    <div className="sm:col-span-2 mt-1 bg-white dark:bg-slate-900 border border-brand-border dark:border-slate-700 rounded-lg p-3">
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <dt className="font-heading font-semibold text-brand-muted uppercase tracking-wider text-xs">Zustellstatus (Resend)</dt>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); fetchResendStatus(email.id); }}
                                          disabled={rs?.loading}
                                          className="text-xs font-heading font-semibold text-accent-blue hover:underline disabled:opacity-40"
                                        >
                                          {rs?.loading ? 'Lädt...' : (rs ? 'Neu laden' : 'Prüfen')}
                                        </button>
                                      </div>
                                      {rs?.loading && !rs?.last_event && (
                                        <p className="text-brand-muted">Frage Resend...</p>
                                      )}
                                      {rs?.error && (
                                        <div className={`rounded border p-2 ${rs.restricted ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                                          <p className={`font-heading font-semibold ${rs.restricted ? 'text-amber-800' : 'text-red-700'}`}>
                                            {rs.restricted ? 'API-Key ist schreibgeschuetzt' : 'Fehler'}
                                          </p>
                                          <p className={`mt-1 text-xs font-mono break-words ${rs.restricted ? 'text-amber-900' : 'text-red-900'}`}>{rs.error}</p>
                                          {rs.hint && (
                                            <p className="mt-2 text-xs text-brand-steel leading-relaxed">{rs.hint}</p>
                                          )}
                                          {rs.dashboardUrl && (
                                            <a
                                              href={rs.dashboardUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="inline-flex items-center gap-1 mt-2 px-3 py-1.5 bg-sky-500 text-white text-xs font-heading font-semibold rounded-btn hover:bg-sky-600 transition-colors"
                                            >
                                              ↗ Im Resend-Dashboard öffnen
                                            </a>
                                          )}
                                        </div>
                                      )}
                                      {eventInfo && (
                                        <>
                                          <p className="font-heading font-semibold" style={{ color: eventInfo.color }}>
                                            {eventInfo.label}
                                          </p>
                                          <p className="text-brand-muted mt-1 text-xs leading-relaxed">{eventInfo.hint}</p>
                                          {rs?.bounce && (
                                            <div className="mt-2 rounded bg-red-50 border border-red-200 p-2 font-mono text-xs text-red-900 whitespace-pre-wrap">
                                              {rs.bounce.type && <div><strong>Typ:</strong> {rs.bounce.type}{rs.bounce.subType ? ` / ${rs.bounce.subType}` : ''}</div>}
                                              {rs.bounce.message && <div className="break-words"><strong>Grund:</strong> {rs.bounce.message}</div>}
                                            </div>
                                          )}
                                          {rs?.dashboardUrl && (
                                            <a
                                              href={rs.dashboardUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="inline-block mt-2 text-xs text-accent-blue hover:underline"
                                            >
                                              Im Resend-Dashboard öffnen ↗
                                            </a>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}
                                {email.error_message && (
                                  <div className="sm:col-span-2 bg-red-50 border border-red-200 rounded-lg p-3 mt-1">
                                    <dt className="font-heading font-semibold text-red-700 uppercase tracking-wider text-xs">Fehlermeldung (Resend)</dt>
                                    <dd className="text-red-900 break-words mt-1 font-mono text-xs whitespace-pre-wrap">{email.error_message}</dd>
                                  </div>
                                )}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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

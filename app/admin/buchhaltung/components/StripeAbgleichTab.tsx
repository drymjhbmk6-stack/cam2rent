'use client';

import { useState, useCallback, useEffect } from 'react';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';
import StatusBadge from './shared/StatusBadge';
import DateRangePicker, { type DateRange } from './shared/DateRangePicker';
import ExportButton from './shared/ExportButton';

interface StripeTx {
  id: string;
  stripe_payment_intent_id: string;
  amount: number;
  fee: number;
  net: number;
  status: string;
  payment_method: string | null;
  booking_id: string | null;
  match_status: string;
  stripe_created_at: string;
  reconciliation_note?: string | null;
  /** Vom GET-Endpoint berechnet: ID der Buchung, deren matched Tx denselben
   *  Betrag im selben Zeitfenster hat → wahrscheinlich Doppelzahlung. */
  duplicate_of_booking_id?: string | null;
  duplicate_of_tx_id?: string | null;
}

interface ReconciliationData {
  transactions: StripeTx[];
  summary: {
    total: number;
    matched: number;
    unmatched_stripe: number;
    unmatched_booking: number;
    total_fees: number;
    duplicates?: number;
  };
}

interface BookingSuggestion {
  id: string;
  customer_name: string;
  price_total: number;
  created_at: string;
  status: string;
}

export default function StripeAbgleichTab() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [matchModal, setMatchModal] = useState<StripeTx | null>(null);
  const [matchBookingId, setMatchBookingId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState<BookingSuggestion[]>([]);
  const [otherBookings, setOtherBookings] = useState<BookingSuggestion[]>([]);
  const [suggestionSearch, setSuggestionSearch] = useState('');
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searchingBookings, setSearchingBookings] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [importingFees, setImportingFees] = useState(false);
  const [refundModal, setRefundModal] = useState<StripeTx | null>(null);
  const [refundReducesIncome, setRefundReducesIncome] = useState(false);
  const [refundMode, setRefundMode] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [refundProcessing, setRefundProcessing] = useState(false);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const fetchData = useCallback(async (r: DateRange) => {
    if (!r.from || !r.to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/stripe-reconciliation?from=${r.from}&to=${r.to}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRangeChange = useCallback((r: DateRange) => {
    setRange(r);
    fetchData(r);
  }, [fetchData]);

  async function handleSync() {
    if (!range.from || !range.to) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/stripe-reconciliation/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: range.from, to: range.to }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast(`${result.synced} Stripe-Transaktionen synchronisiert`, 'ok');
        setLastSyncAt(new Date().toISOString());
        fetchData(range);
      } else {
        const err = await res.json();
        showToast(err.error || 'Sync fehlgeschlagen', 'err');
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleMatch() {
    if (!matchModal || !matchBookingId) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/stripe-reconciliation/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: matchModal.id, booking_id: matchBookingId }),
      });
      if (res.ok) {
        showToast('Manuell verknüpft', 'ok');
        setMatchModal(null);
        setMatchBookingId('');
        fetchData(range);
      } else {
        showToast('Fehler beim Verknüpfen', 'err');
      }
    } finally {
      setProcessing(false);
    }
  }

  function openRefundModal(tx: StripeTx) {
    setRefundModal(tx);
    setRefundReducesIncome(false);
    setRefundMode('full');
    setRefundAmount(tx.amount.toFixed(2).replace('.', ','));
    setRefundNote(tx.reconciliation_note || '');
  }

  // Markiert die Tx mit einem Klick als Doppelzahlung der erkannten Buchung
  // (verknuepft + match_status='refunded', kein Einkommens-Abzug). Stripe-
  // Refund auslesen bleibt manuell — entweder im Stripe-Dashboard erledigen
  // oder ueber den existierenden "Erstattung erfassen"-Workflow Stripe-Refunds
  // anlegen.
  const [duplicateProcessing, setDuplicateProcessing] = useState<string | null>(null);
  async function handleMarkDuplicate(tx: StripeTx) {
    if (!tx.duplicate_of_booking_id) return;
    const ok = window.confirm(
      `Diese Zahlung als Doppelzahlung von Buchung ${tx.duplicate_of_booking_id} markieren?\n\n`
      + `Die Buchung selbst bleibt unveraendert (keine Einnahme-Minderung). `
      + `Bitte die Erstattung anschliessend im Stripe-Dashboard ausloesen.`,
    );
    if (!ok) return;
    setDuplicateProcessing(tx.id);
    try {
      const res = await fetch('/api/admin/buchhaltung/stripe-reconciliation/mark-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: tx.id,
          original_booking_id: tx.duplicate_of_booking_id,
        }),
      });
      if (res.ok) {
        showToast('Als Doppelzahlung erfasst', 'ok');
        fetchData(range);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Fehler beim Erfassen', 'err');
      }
    } finally {
      setDuplicateProcessing(null);
    }
  }

  async function handleRefund() {
    if (!refundModal) return;
    const note = refundNote.trim();
    if (note.length < 3) { showToast('Kommentar erforderlich (mind. 3 Zeichen).', 'err'); return; }
    const reducesIncome = !!refundModal.booking_id && refundReducesIncome;
    let amount: number | undefined;
    if (reducesIncome && refundMode === 'partial') {
      amount = parseFloat(refundAmount.replace(',', '.'));
      if (!(amount > 0)) { showToast('Erstattungsbetrag muss größer als 0 sein.', 'err'); return; }
    }
    setRefundProcessing(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/stripe-reconciliation/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: refundModal.id, scope: refundMode, amount, reduces_income: reducesIncome, note }),
      });
      if (res.ok) {
        const json = await res.json();
        showToast(
          json.target === 'booking'
            ? (reducesIncome
                ? 'Erstattung erfasst — Einnahme der Buchung gemindert (EÜR + DATEV)'
                : 'Als Überzahlung/Fehlbuchung markiert — Buchungsbetrag bleibt')
            : 'Als Fehlbuchung markiert',
          'ok',
        );
        setRefundModal(null);
        fetchData(range);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Fehler beim Erfassen der Erstattung', 'err');
      }
    } finally {
      setRefundProcessing(false);
    }
  }

  async function handleCsvExport() {
    if (!range.from || !range.to) return;
    const res = await fetch(`/api/admin/buchhaltung/stripe-reconciliation/export?from=${range.from}&to=${range.to}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stripe-abgleich-${range.from}-${range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleImportFees() {
    if (!range.from || !range.to) return;
    setImportingFees(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/stripe-reconciliation/import-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: range.from, to: range.to }),
      });
      if (res.ok) {
        const result = await res.json();
        const msg = result.updated
          ? `${result.imported} Stripe-Gebühren verbucht, ${result.updated} Beschreibungen aktualisiert`
          : `${result.imported} Stripe-Gebühren als Ausgaben verbucht`;
        showToast(msg, 'ok');
      } else {
        const err = await res.json();
        showToast(err.error || 'Fehler', 'err');
      }
    } finally {
      setImportingFees(false);
    }
  }

  // Buchungssuche im Modal (debounced). Betragsgleiche `suggestions` bleiben
  // oben gepinnt — nur `otherBookings` wird durch die Suche ersetzt.
  useEffect(() => {
    if (!matchModal) return;
    const tx = matchModal;
    const term = suggestionSearch.trim();
    const handle = setTimeout(async () => {
      setSearchingBookings(true);
      try {
        const url = term
          ? `/api/admin/buchhaltung/stripe-reconciliation/suggestions?q=${encodeURIComponent(term)}`
          : `/api/admin/buchhaltung/stripe-reconciliation/suggestions?amount=${tx.amount}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setOtherBookings(json.others || []);
        }
      } finally {
        setSearchingBookings(false);
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionSearch, matchModal?.id]);

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', background: '#0f172a', border: '1px solid #1e293b',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%',
  };

  const BOOKING_STATUS_LABEL: Record<string, string> = {
    confirmed: 'Bestätigt', cancelled: 'Storniert', completed: 'Abgeschlossen',
    shipped: 'Versendet', picked_up: 'Abgeholt', returned: 'Zurückgegeben',
    pending_verification: 'Verifizierung offen', awaiting_payment: 'Zahlung offen',
    pending: 'Ausstehend',
  };

  const renderBookingButton = (s: BookingSuggestion) => (
    <button
      key={s.id}
      onClick={() => setMatchBookingId(s.id)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
        background: matchBookingId === s.id ? '#0e7490' : '#1e293b',
        border: matchBookingId === s.id ? '1px solid #06b6d4' : '1px solid #334155',
        color: '#e2e8f0', fontSize: 13, width: '100%',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontWeight: 700, color: '#06b6d4' }}>{s.id}</span>
        <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.customer_name}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <StatusBadge status={s.status} customLabel={BOOKING_STATUS_LABEL[s.status] || s.status} />
        <span style={{ fontWeight: 600, color: '#10b981' }}>{formatCurrency(s.price_total)}</span>
      </span>
    </button>
  );

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 8, background: toast.type === 'ok' ? '#10b981' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <DateRangePicker onChange={handleRangeChange} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleSync} disabled={syncing || !range.from} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: syncing ? 'not-allowed' : 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none', opacity: syncing ? 0.5 : 1 }}>
            {syncing ? 'Synchronisiere...' : 'Synchronisieren'}
          </button>
          <button onClick={handleImportFees} disabled={importingFees || !data} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: importingFees || !data ? 'not-allowed' : 'pointer', background: 'transparent', color: '#06b6d4', border: '1px solid #06b6d4', opacity: importingFees || !data ? 0.5 : 1 }}>
            {importingFees ? 'Importiere...' : 'Gebühren als Ausgaben'}
          </button>
          <ExportButton label="CSV-Export" onClick={handleCsvExport} disabled={!data} />
        </div>
      </div>

      {lastSyncAt && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          Letzte Synchronisierung: {new Date(lastSyncAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} Uhr
        </div>
      )}

      {/* Übersicht */}
      {data?.summary && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <SummaryCard icon="check" color="#10b981" label="Verknüpft" value={`${data.summary.matched} Zahlungen`} />
          <SummaryCard icon="warn" color="#f59e0b" label="Stripe ohne Buchung" value={`${data.summary.unmatched_stripe}`} />
          <SummaryCard icon="warn" color="#f97316" label="Buchung ohne Stripe" value={`${data.summary.unmatched_booking}`} />
          <SummaryCard icon="euro" color="#06b6d4" label="Stripe-Gebühren" value={formatCurrency(data.summary.total_fees)} />
        </div>
      )}

      {/* Tabelle */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={thStyle}>Datum</th>
                <th style={thStyle}>Stripe-PI</th>
                <th style={thStyle}>Buchungs-Nr.</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Brutto</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Gebühr</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Netto</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} style={{ padding: 12 }}><div style={{ height: 20, background: '#1e293b', borderRadius: 4 }} /></td></tr>
                ))
              ) : (data?.transactions ?? []).length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Keine Transaktionen. Klicke &quot;Synchronisieren&quot; um Stripe-Daten zu laden.</td></tr>
              ) : (
                (data?.transactions ?? []).map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{fmtDateShort(tx.stripe_created_at)}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>{tx.stripe_payment_intent_id.slice(0, 20)}...</td>
                    <td style={{ padding: '10px 8px', color: tx.booking_id ? '#06b6d4' : '#64748b', fontWeight: tx.booking_id ? 600 : 400 }}>{tx.booking_id || '—'}</td>
                    <td style={{ padding: '10px 8px', color: '#e2e8f0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatCurrency(tx.amount)}</td>
                    <td style={{ padding: '10px 8px', color: '#ef4444', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(tx.fee)}</td>
                    <td style={{ padding: '10px 8px', color: '#10b981', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(tx.net)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <StatusBadge status={tx.match_status} />
                      {tx.duplicate_of_booking_id && tx.match_status === 'unmatched' && (
                        <div style={{
                          marginTop: 4,
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(239,68,68,0.15)',
                          color: '#fca5a5',
                          fontSize: 11,
                          fontWeight: 700,
                        }} title={`Gleiche Summe + gleiches Zeitfenster wie eine bereits verknuepfte Zahlung von Buchung ${tx.duplicate_of_booking_id}`}>
                          🔄 Doppelzahlung von {tx.duplicate_of_booking_id}
                        </div>
                      )}
                      {tx.reconciliation_note && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, maxWidth: 180, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.reconciliation_note}>
                          {tx.reconciliation_note}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {tx.match_status === 'unmatched' && tx.duplicate_of_booking_id && (
                          <button
                            onClick={() => handleMarkDuplicate(tx)}
                            disabled={duplicateProcessing === tx.id}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: 'rgba(239,68,68,0.12)',
                              border: '1px solid #b91c1c',
                              color: '#fecaca',
                              cursor: duplicateProcessing === tx.id ? 'wait' : 'pointer',
                              fontSize: 12,
                              fontWeight: 700,
                              opacity: duplicateProcessing === tx.id ? 0.6 : 1,
                            }}
                            title={`Verknuepft mit Buchung ${tx.duplicate_of_booking_id} + markiert als Erstattung (kein Einnahme-Abzug). Stripe-Refund bitte separat ausloesen.`}
                          >
                            {duplicateProcessing === tx.id ? '…' : '🔄 Als Doppelzahlung'}
                          </button>
                        )}
                        {tx.match_status === 'unmatched' && (
                          <button
                            onClick={async () => {
                              setMatchModal(tx);
                              setMatchBookingId('');
                              setSuggestions([]);
                              setOtherBookings([]);
                              setSuggestionSearch('');
                              setLoadingSuggestions(true);
                              try {
                                const res = await fetch(`/api/admin/buchhaltung/stripe-reconciliation/suggestions?amount=${tx.amount}`);
                                if (res.ok) {
                                  const json = await res.json();
                                  setSuggestions(json.suggestions || []);
                                  setOtherBookings(json.others || []);
                                }
                              } finally {
                                setLoadingSuggestions(false);
                              }
                            }}
                            style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid #1e293b', color: '#06b6d4', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                          >
                            Verknüpfen
                          </button>
                        )}
                        <button
                          onClick={() => openRefundModal(tx)}
                          style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid #1e293b', color: '#f97316', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >
                          Erstattung
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Match-Modal */}
      {matchModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMatchModal(null); }}
        >
          <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 28, maxWidth: 440, width: '90%' }}>
            <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Manuell verknüpfen</h3>
            <div style={{ marginBottom: 16, fontSize: 14, color: '#94a3b8' }}>
              <div>Stripe-PI: <span style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{matchModal.stripe_payment_intent_id.slice(0, 30)}...</span></div>
              <div>Betrag: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatCurrency(matchModal.amount)}</span></div>
            </div>
            {/* Buchungsauswahl */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
                Buchung auswählen
              </label>
              <input
                value={suggestionSearch}
                onChange={(e) => setSuggestionSearch(e.target.value)}
                placeholder="Suche nach Buchungs-Nr. oder Kundenname…"
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              {loadingSuggestions ? (
                <div style={{ fontSize: 13, color: '#64748b', padding: '8px 0' }}>Lade Buchungen…</div>
              ) : (suggestions.length === 0 && otherBookings.length === 0) ? (
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                  {searchingBookings ? 'Suche…' : 'Keine Buchungen gefunden — ID unten manuell eingeben.'}
                </div>
              ) : (
                <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {suggestions.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '2px 0 2px' }}>
                        Betragsgleiche Buchungen
                      </div>
                      {suggestions.map(renderBookingButton)}
                    </>
                  )}
                  {otherBookings.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: `${suggestions.length > 0 ? 10 : 2}px 0 2px` }}>
                        {suggestionSearch.trim() ? 'Suchergebnisse' : 'Alle Buchungen'}{searchingBookings ? ' · suche…' : ''}
                      </div>
                      {otherBookings.map(renderBookingButton)}
                    </>
                  )}
                </div>
              )}
              <input
                value={matchBookingId}
                onChange={(e) => setMatchBookingId(e.target.value)}
                placeholder="oder Buchungs-Nr. direkt eingeben (z.B. C2R-2618-001)"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleMatch} disabled={processing || !matchBookingId} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none', opacity: processing || !matchBookingId ? 0.5 : 1 }}>
                {processing ? 'Verknüpfe...' : 'Verknüpfen'}
              </button>
              <button onClick={() => setMatchModal(null)} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b' }}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
      {/* Erstattung / Fehlbuchung Modal */}
      {refundModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setRefundModal(null); }}
        >
          <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 28, maxWidth: 460, width: '90%' }}>
            <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Erstattung / Fehlbuchung erfassen</h3>
            <div style={{ marginBottom: 16, fontSize: 14, color: '#94a3b8' }}>
              <div>Stripe-PI: <span style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{refundModal.stripe_payment_intent_id.slice(0, 30)}...</span></div>
              <div>Betrag: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatCurrency(refundModal.amount)}</span></div>
              <div>Buchung: <span style={{ color: refundModal.booking_id ? '#06b6d4' : '#64748b', fontWeight: 600 }}>{refundModal.booking_id || 'keine (nicht zugeordnet)'}</span></div>
            </div>

            {!refundModal.booking_id && (
              <div style={{ marginBottom: 16, fontSize: 13, color: '#94a3b8', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px' }}>
                Diese Zahlung ist keiner Buchung zugeordnet — sie zählt ohnehin nicht als Einnahme. Die Markierung dokumentiert die Fehlbuchung. Die Stripe-Gebühr bleibt als Ausgabe (wird von Stripe bei Rückerstattung nicht erstattet).
              </div>
            )}

            {refundModal.booking_id && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: '#e2e8f0', marginBottom: 10, cursor: 'pointer' }}>
                  <input type="radio" checked={!refundReducesIncome} onChange={() => setRefundReducesIncome(false)} style={{ marginTop: 3 }} />
                  <span>
                    <strong>Stripe-Überzahlung / Fehlbuchung korrigiert</strong>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Stripe hat zu viel eingezogen, der Buchungs-/Rechnungsbetrag war bereits korrekt. <strong>Kein Einnahme-Abzug</strong> (setzt einen evtl. zuvor erfassten Abzug auf 0 zurück).</div>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: '#e2e8f0', cursor: 'pointer' }}>
                  <input type="radio" checked={refundReducesIncome} onChange={() => setRefundReducesIncome(true)} style={{ marginTop: 3 }} />
                  <span>
                    <strong>Echte Erstattung — Einnahme mindern</strong>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Die Buchung war korrekt berechnet, der Kunde bekommt Geld zurück. Wird in EÜR + DATEV vom Einkommen abgezogen.</div>
                  </span>
                </label>

                {refundReducesIncome && (
                  <div style={{ marginTop: 12, paddingLeft: 24 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#e2e8f0', marginBottom: 8, cursor: 'pointer' }}>
                      <input type="radio" checked={refundMode === 'full'} onChange={() => setRefundMode('full')} />
                      Voll erstattet (Einnahme der Buchung → 0)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#e2e8f0', cursor: 'pointer' }}>
                      <input type="radio" checked={refundMode === 'partial'} onChange={() => setRefundMode('partial')} />
                      Teilerstattung
                    </label>
                    {refundMode === 'partial' && (
                      <input
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="Einnahmemindernder Gesamtbetrag in € (z.B. 3,95)"
                        style={{ ...inputStyle, marginTop: 10 }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
                Kommentar (Pflicht)
              </label>
              <textarea
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
                rows={3}
                placeholder="z.B. Kunde hat doppelt bezahlt — komplett erstattet"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleRefund} disabled={refundProcessing || refundNote.trim().length < 3} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: refundProcessing || refundNote.trim().length < 3 ? 'not-allowed' : 'pointer', background: '#f97316', color: '#0f172a', border: 'none', opacity: refundProcessing || refundNote.trim().length < 3 ? 0.5 : 1 }}>
                {refundProcessing ? 'Speichere...' : 'Erstattung erfassen'}
              </button>
              <button onClick={() => setRefundModal(null)} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b' }}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
    warn: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    euro: <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>€</span>,
  };
  return (
    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 180 }}>
      {iconMap[icon]}
      <div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 8px', color: '#64748b', fontWeight: 600,
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
};

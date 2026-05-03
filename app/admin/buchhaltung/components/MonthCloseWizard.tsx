'use client';

import { useState, useEffect, useCallback } from 'react';
import { fmtEuro } from '@/lib/format-utils';

interface Step {
  complete: boolean;
}

interface PeriodStatus {
  period: string;
  from: string;
  to: string;
  steps: {
    stripe: Step & { total: number; unmatched: number };
    purchases: Step & { pending: number };
    euer: Step & { revenue: number; expenses: number; profit: number; invoiceCount: number; expenseCount: number };
    lock: Step & {
      lock: { locked_at: string; locked_by: string; unlocked_at?: string; unlock_reason?: string } | null;
    };
  };
  canClose: boolean;
  isLocked: boolean;
}

interface Props {
  initialPeriod?: string; // YYYY-MM, default: Vormonat
  onClose: () => void;
  onNavigate?: (tab: string, sub?: string) => void;
}

function getPreviousMonth(): string {
  const berlinNow = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const [yStr, mStr] = berlinNow.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

export default function MonthCloseWizard({ initialPeriod, onClose, onNavigate }: Props) {
  const [period, setPeriod] = useState(initialPeriod || getPreviousMonth());
  const [status, setStatus] = useState<PeriodStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(1);

  const fetchStatus = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/buchhaltung/period-close?period=${p}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json: PeriodStatus = await res.json();
      setStatus(json);
      // Spring zum ersten unfertigen Schritt
      if (!json.steps.stripe.complete) setActiveStep(1);
      else if (!json.steps.purchases.complete) setActiveStep(2);
      else setActiveStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus(period);
  }, [period, fetchStatus]);

  async function handleClose() {
    if (!status?.canClose) return;
    if (!confirm(`Monat ${formatPeriodLabel(period)} jetzt abschließen?\n\nDanach werden Änderungen mit einer Warnung versehen — sie sind nicht hart blockiert, aber als Audit-Trail dokumentiert. Aufheben des Abschlusses ist mit Begründung möglich.`)) return;
    setClosing(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/period-close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period, confirm: true }),
      });
      const json = await res.json();
      if (res.ok) {
        await fetchStatus(period);
      } else {
        setError(json.error || 'Fehler');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setClosing(false);
    }
  }

  function formatPeriodLabel(p: string): string {
    const [y, m] = p.split('-');
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 15);
    return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  }

  function navigateToTab(tab: string, sub?: string) {
    onClose();
    if (onNavigate) onNavigate(tab, sub);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.85)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 16,
          maxWidth: 720,
          width: '100%',
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#e2e8f0' }}>Monatsabschluss</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              {formatPeriodLabel(period)}
              {status?.isLocked && (
                <span style={{ marginLeft: 10, color: '#10b981', fontWeight: 600 }}>· abgeschlossen</span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', padding: '6px 10px', borderRadius: 8, fontSize: 13 }}
            />
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer', padding: 0, width: 32, height: 32, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {loading && <div style={{ color: '#64748b', textAlign: 'center', padding: 32 }}>Lade Daten…</div>}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, padding: 12, color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {status && !loading && (
            <>
              {/* Schritt-Indikator */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                <StepPill n={1} label="Stripe-Abgleich" active={activeStep === 1} complete={status.steps.stripe.complete} onClick={() => setActiveStep(1)} />
                <StepPill n={2} label="Lieferanten" active={activeStep === 2} complete={status.steps.purchases.complete} onClick={() => setActiveStep(2)} />
                <StepPill n={3} label="EÜR-Vorschau" active={activeStep === 3} complete={status.steps.euer.complete} onClick={() => setActiveStep(3)} />
                <StepPill n={4} label="Abschließen" active={activeStep === 4} complete={status.steps.lock.complete} onClick={() => setActiveStep(4)} />
              </div>

              {/* Schritt 1 */}
              {activeStep === 1 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Stripe-Abgleich</h3>
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8' }}>
                    Alle Stripe-Zahlungen aus {formatPeriodLabel(period)} sollten einer Buchung zugeordnet sein.
                  </p>
                  <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>Transaktionen gesamt</span>
                      <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{status.steps.stripe.total}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: status.steps.stripe.unmatched === 0 ? '#10b981' : '#f59e0b', fontSize: 13 }}>
                        {status.steps.stripe.unmatched === 0 ? '✓ Alle zugeordnet' : 'Nicht zugeordnet'}
                      </span>
                      {status.steps.stripe.unmatched > 0 && (
                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>{status.steps.stripe.unmatched}</span>
                      )}
                    </div>
                  </div>
                  {status.steps.stripe.unmatched > 0 && (
                    <button onClick={() => navigateToTab('stripe')} style={primaryBtnStyle}>
                      Zum Stripe-Abgleich →
                    </button>
                  )}
                </div>
              )}

              {/* Schritt 2 */}
              {activeStep === 2 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Lieferanten-Klassifizierung</h3>
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8' }}>
                    Alle Eingangsrechnungspositionen aus diesem Monat sollten als Anlagegut, Ausgabe oder Ignorieren klassifiziert sein.
                  </p>
                  <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: status.steps.purchases.complete ? '#10b981' : '#f59e0b', fontSize: 13 }}>
                        {status.steps.purchases.complete ? '✓ Alle klassifiziert' : 'Offene Klassifizierungen'}
                      </span>
                      {!status.steps.purchases.complete && (
                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>{status.steps.purchases.pending}</span>
                      )}
                    </div>
                  </div>
                  {!status.steps.purchases.complete && (
                    <button onClick={() => navigateToTab('ausgaben', 'einkauf')} style={primaryBtnStyle}>
                      Zu Lieferanten-Rechnungen →
                    </button>
                  )}
                </div>
              )}

              {/* Schritt 3 */}
              {activeStep === 3 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>EÜR-Vorschau</h3>
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8' }}>
                    Plausibilitätsprüfung: Einnahmen, Ausgaben, Gewinn des Monats.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                    <SummaryBlock label="Einnahmen" value={fmtEuro(status.steps.euer.revenue)} sub={`${status.steps.euer.invoiceCount} Rechnungen`} color="#10b981" />
                    <SummaryBlock label="Ausgaben" value={fmtEuro(status.steps.euer.expenses)} sub={`${status.steps.euer.expenseCount} Belege`} color="#f59e0b" />
                    <SummaryBlock label="Gewinn" value={fmtEuro(status.steps.euer.profit)} sub="vor Steuern" color="#06b6d4" />
                  </div>
                  <button onClick={() => navigateToTab('reports', 'analyse')} style={secondaryBtnStyle}>
                    Detaillierte EÜR ansehen →
                  </button>
                </div>
              )}

              {/* Schritt 4 */}
              {activeStep === 4 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Monat abschließen</h3>
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                    Ein abgeschlossener Monat wird im System markiert. Aktuell ist das ein <strong style={{ color: '#06b6d4' }}>Soft-Lock</strong> — nachträgliche Änderungen sind möglich, werden aber im Audit-Log protokolliert. Beim Wechsel auf Regelbesteuerung wird daraus eine harte Sperre.
                  </p>

                  {status.isLocked && status.steps.lock.lock && (
                    <div style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ color: '#6ee7b7', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>✓ Abgeschlossen</div>
                      <div style={{ color: '#94a3b8', fontSize: 12 }}>
                        am {new Date(status.steps.lock.lock.locked_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} von {status.steps.lock.lock.locked_by}
                      </div>
                    </div>
                  )}

                  {!status.isLocked && !status.canClose && (
                    <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, padding: 14, marginBottom: 16, color: '#fbbf24', fontSize: 13 }}>
                      Es gibt noch offene Schritte. Bitte erst die ersten drei Schritte erledigen.
                    </div>
                  )}

                  {status.canClose && !status.isLocked && (
                    <div>
                      <button
                        onClick={handleClose}
                        disabled={closing}
                        style={{ ...primaryBtnStyle, background: '#10b981', borderColor: '#10b981', color: '#fff', width: '100%', padding: '12px 20px', fontSize: 14 }}
                      >
                        {closing ? 'Schliesse ab…' : `Monat ${formatPeriodLabel(period)} abschließen`}
                      </button>
                      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                        Du kannst den Abschluss später mit Begründung wieder aufheben.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepPill({ n, label, active, complete, onClick }: { n: number; label: string; active: boolean; complete: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderRadius: 999,
        border: `1px solid ${active ? '#06b6d4' : complete ? 'rgba(16,185,129,0.4)' : '#1e293b'}`,
        background: active ? 'rgba(6,182,212,0.15)' : complete ? 'rgba(16,185,129,0.10)' : '#111827',
        color: active ? '#67e8f9' : complete ? '#6ee7b7' : '#94a3b8',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: active ? '#06b6d4' : complete ? '#10b981' : '#1e293b',
        color: active || complete ? '#0f172a' : '#94a3b8',
        fontSize: 11,
        fontWeight: 700,
      }}>
        {complete ? '✓' : n}
      </span>
      {label}
    </button>
  );
}

function SummaryBlock({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>{sub}</div>
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  background: '#06b6d4',
  color: '#0f172a',
  border: '1px solid #06b6d4',
  borderRadius: 10,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid #1e293b',
  borderRadius: 10,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0f1e',
  card: '#111827',
  border: '#1e293b',
  cyan: '#06b6d4',
  cyanLight: '#22d3ee',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  textDark: '#475569',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface DatevConfig {
  erloeskonto: string;
  umsatzsteuerkonto: string;
  kautionskonto: string;
  versandkostenkonto: string;
  beraternummer: string;
  mandantennummer: string;
  wirtschaftsjahr_beginn: string;
}

type PeriodType = 'monat' | 'quartal' | 'jahr' | 'benutzerdefiniert';

interface PreviewData {
  count: number;
  revenue: number;
}

const DEFAULT_CONFIG: DatevConfig = {
  erloeskonto: '8400',
  umsatzsteuerkonto: '1776',
  kautionskonto: '1590',
  versandkostenkonto: '3800',
  beraternummer: '',
  mandantennummer: '',
  wirtschaftsjahr_beginn: '01',
};

const MONTHS = [
  { value: '01', label: 'Januar' },
  { value: '02', label: 'Februar' },
  { value: '03', label: 'Marz' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Dezember' },
];

// ─── Helper Components ────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, ...style }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '10px 12px',
        background: '#0f172a',
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        color: C.text,
        fontSize: 14,
        outline: 'none',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = C.cyan; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
    />
  );
}

function Select({ value, onChange, children }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '10px 12px',
        background: '#0f172a',
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        color: C.text,
        fontSize: 14,
        outline: 'none',
        cursor: 'pointer',
      }}
    >
      {children}
    </select>
  );
}

function Button({ children, onClick, disabled, variant = 'primary', style: extraStyle }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  style?: React.CSSProperties;
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 20px',
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: isPrimary ? C.cyan : 'transparent',
        color: isPrimary ? '#0f172a' : C.cyan,
        border: isPrimary ? 'none' : `1px solid ${C.cyan}`,
        transition: 'opacity 0.15s',
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────
function getMonthRange(date: Date): { from: string; to: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const from = new Date(y, m, 1).toISOString().split('T')[0];
  const to = new Date(y, m + 1, 0).toISOString().split('T')[0];
  return { from, to };
}

function getQuarterRange(date: Date): { from: string; to: string } {
  const y = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3);
  const from = new Date(y, q * 3, 1).toISOString().split('T')[0];
  const to = new Date(y, q * 3 + 3, 0).toISOString().split('T')[0];
  return { from, to };
}

function getYearRange(date: Date): { from: string; to: string } {
  const y = date.getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BuchhaltungPage() {
  // Config state
  const [config, setConfig] = useState<DatevConfig>(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSuccess, setConfigSuccess] = useState('');

  // Export state
  const [periodType, setPeriodType] = useState<PeriodType>('monat');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // Load config on mount
  useEffect(() => {
    fetch('/api/admin/config?key=datev_config')
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === 'object' && data.erloeskonto) {
          setConfig({ ...DEFAULT_CONFIG, ...data });
        }
        setConfigLoading(false);
      })
      .catch(() => setConfigLoading(false));
  }, []);

  // Compute date range from period
  const getDateRange = useCallback((): { from: string; to: string } | null => {
    const now = new Date();
    switch (periodType) {
      case 'monat':
        return getMonthRange(now);
      case 'quartal':
        return getQuarterRange(now);
      case 'jahr':
        return getYearRange(now);
      case 'benutzerdefiniert':
        if (customFrom && customTo) return { from: customFrom, to: customTo };
        return null;
    }
  }, [periodType, customFrom, customTo]);

  // Load preview when period changes
  useEffect(() => {
    const range = getDateRange();
    if (!range) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    fetch(`/api/admin/datev-export?from=${range.from}&to=${range.to}&preview=1`)
      .then((r) => r.json())
      .then((data) => {
        setPreview(data);
        setPreviewLoading(false);
      })
      .catch(() => {
        setPreview(null);
        setPreviewLoading(false);
      });
  }, [getDateRange]);

  // Save config
  async function handleSaveConfig() {
    setConfigSaving(true);
    setConfigSuccess('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'datev_config', value: config }),
      });
      if (res.ok) {
        setConfigSuccess('Konfiguration gespeichert');
        setTimeout(() => setConfigSuccess(''), 3000);
      }
    } finally {
      setConfigSaving(false);
    }
  }

  // Download export
  async function handleExport() {
    const range = getDateRange();
    if (!range) return;

    setExporting(true);
    setExportError('');
    try {
      const res = await fetch(`/api/admin/datev-export?from=${range.from}&to=${range.to}`);
      if (!res.ok) {
        const err = await res.json();
        setExportError(err.error || 'Export fehlgeschlagen');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `cam2rent-DATEV-${range.from}-bis-${range.to}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Netzwerkfehler beim Export');
    } finally {
      setExporting(false);
    }
  }

  function updateConfig(key: keyof DatevConfig, val: string) {
    setConfig((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0 }}>
          Buchhaltung & DATEV-Export
        </h1>
        <p style={{ color: C.textMuted, fontSize: 14, marginTop: 6 }}>
          DATEV-Konten konfigurieren und Buchungsstapel als CSV exportieren.
        </p>
      </div>

      {/* ─── Konten-Konfiguration ─────────────────────────────────────────── */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <svg style={{ color: C.cyan }} className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>
            Konten-Konfiguration
          </h2>
        </div>

        {configLoading ? (
          <p style={{ color: C.textDim, fontSize: 14 }}>Laden...</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <Label>Erloeskonto</Label>
                <Input value={config.erloeskonto} onChange={(v) => updateConfig('erloeskonto', v)} placeholder="8400" />
              </div>
              <div>
                <Label>Umsatzsteuer-Konto</Label>
                <Input value={config.umsatzsteuerkonto} onChange={(v) => updateConfig('umsatzsteuerkonto', v)} placeholder="1776" />
              </div>
              <div>
                <Label>Kautionskonto</Label>
                <Input value={config.kautionskonto} onChange={(v) => updateConfig('kautionskonto', v)} placeholder="1590" />
              </div>
              <div>
                <Label>Versandkosten-Konto</Label>
                <Input value={config.versandkostenkonto} onChange={(v) => updateConfig('versandkostenkonto', v)} placeholder="3800" />
              </div>
              <div>
                <Label>Beraternummer</Label>
                <Input value={config.beraternummer} onChange={(v) => updateConfig('beraternummer', v)} placeholder="z.B. 1234567" />
              </div>
              <div>
                <Label>Mandantennummer</Label>
                <Input value={config.mandantennummer} onChange={(v) => updateConfig('mandantennummer', v)} placeholder="z.B. 12345" />
              </div>
              <div>
                <Label>Wirtschaftsjahr-Beginn</Label>
                <Select value={config.wirtschaftsjahr_beginn} onChange={(v) => updateConfig('wirtschaftsjahr_beginn', v)}>
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
              <Button onClick={handleSaveConfig} disabled={configSaving}>
                {configSaving ? 'Speichern...' : 'Konfiguration speichern'}
              </Button>
              {configSuccess && (
                <span style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>{configSuccess}</span>
              )}
            </div>
          </>
        )}
      </Card>

      {/* ─── Export ────────────────────────────────────────────────────────── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <svg style={{ color: C.cyan }} className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>
            Export
          </h2>
        </div>

        {/* Period picker */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <Label>Zeitraum</Label>
            <Select value={periodType} onChange={(v) => setPeriodType(v as PeriodType)}>
              <option value="monat">Aktueller Monat</option>
              <option value="quartal">Aktuelles Quartal</option>
              <option value="jahr">Aktuelles Jahr</option>
              <option value="benutzerdefiniert">Benutzerdefiniert</option>
            </Select>
          </div>

          {periodType === 'benutzerdefiniert' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
              <div style={{ flex: 1 }}>
                <Label>Von</Label>
                <Input type="date" value={customFrom} onChange={setCustomFrom} />
              </div>
              <div style={{ flex: 1 }}>
                <Label>Bis</Label>
                <Input type="date" value={customTo} onChange={setCustomTo} />
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        {previewLoading ? (
          <div style={{ padding: '16px 0', color: C.textDim, fontSize: 14 }}>
            Vorschau laden...
          </div>
        ) : preview ? (
          <div style={{
            display: 'flex',
            gap: 24,
            padding: 16,
            background: '#0f172a',
            borderRadius: 8,
            marginBottom: 20,
          }}>
            <div>
              <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
                Buchungen im Zeitraum
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>
                {preview.count}
              </div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div>
              <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
                Gesamtumsatz (brutto)
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.cyan }}>
                {formatCurrency(preview.revenue)}
              </div>
            </div>
            {getDateRange() && (
              <>
                <div style={{ width: 1, background: C.border }} />
                <div>
                  <div style={{ fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
                    Zeitraum
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.textMuted }}>
                    {formatDate(getDateRange()!.from)} - {formatDate(getDateRange()!.to)}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : periodType === 'benutzerdefiniert' && (!customFrom || !customTo) ? (
          <div style={{ padding: '16px 0', color: C.textDim, fontSize: 14 }}>
            Bitte Von- und Bis-Datum angeben.
          </div>
        ) : null}

        {/* Export button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            onClick={handleExport}
            disabled={exporting || !getDateRange() || (preview?.count === 0)}
          >
            {exporting ? 'Exportiere...' : 'DATEV-Export herunterladen'}
          </Button>
          {preview?.count === 0 && (
            <span style={{ color: C.yellow, fontSize: 13 }}>
              Keine Buchungen im ausgewahlten Zeitraum.
            </span>
          )}
          {exportError && (
            <span style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>
              {exportError}
            </span>
          )}
        </div>

        {/* Info box */}
        <div style={{
          marginTop: 20,
          padding: 14,
          background: 'rgba(6,182,212,0.06)',
          borderRadius: 8,
          border: `1px solid rgba(6,182,212,0.15)`,
        }}>
          <p style={{ color: C.textMuted, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Der Export erzeugt eine DATEV-Buchungsstapel-CSV (Semikolon-getrennt, UTF-8 mit BOM).
            Die Datei kann direkt in DATEV Unternehmen online oder DATEV Kanzlei-Rechnungswesen importiert werden.
            Stornierte Buchungen werden als negative Betrage (Storno) exportiert.
          </p>
        </div>
      </Card>
    </div>
  );
}

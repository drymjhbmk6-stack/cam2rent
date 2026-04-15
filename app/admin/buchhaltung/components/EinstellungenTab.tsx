'use client';

import { useState, useEffect } from 'react';
import { getTaxModeLabel } from '@/lib/accounting/tax';

interface BuchhaltungSettings {
  // Steuermodus
  tax_mode: 'kleinunternehmer' | 'regelbesteuerung';
  tax_rate: string;
  ust_id: string;
  // DATEV
  datev_erloeskonto: string;
  datev_umsatzsteuerkonto: string;
  datev_kautionskonto: string;
  datev_versandkostenkonto: string;
  datev_beraternummer: string;
  datev_mandantennummer: string;
  datev_wirtschaftsjahr_beginn: string;
  // Mahnwesen
  dunning_days_1: string;
  dunning_days_2: string;
  dunning_days_3: string;
  dunning_fee_1: string;
  dunning_fee_2: string;
  dunning_fee_3: string;
  // Rechnungs-Defaults
  payment_terms_days: string;
  invoice_footer: string;
}

const DEFAULT_SETTINGS: BuchhaltungSettings = {
  tax_mode: 'kleinunternehmer',
  tax_rate: '19',
  ust_id: '',
  datev_erloeskonto: '8400',
  datev_umsatzsteuerkonto: '1776',
  datev_kautionskonto: '1590',
  datev_versandkostenkonto: '3800',
  datev_beraternummer: '',
  datev_mandantennummer: '',
  datev_wirtschaftsjahr_beginn: '01',
  dunning_days_1: '14',
  dunning_days_2: '28',
  dunning_days_3: '42',
  dunning_fee_1: '0',
  dunning_fee_2: '5',
  dunning_fee_3: '10',
  payment_terms_days: '14',
  invoice_footer: 'Vielen Dank für deine Buchung bei cam2rent!',
};

export default function EinstellungenTab() {
  const [settings, setSettings] = useState<BuchhaltungSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Lade Steuersettings
        const taxRes = await fetch('/api/admin/settings?key=tax_mode');
        if (taxRes.ok) {
          const d = await taxRes.json();
          if (d.value) setSettings(s => ({ ...s, tax_mode: d.value as 'kleinunternehmer' | 'regelbesteuerung' }));
        }

        const taxRateRes = await fetch('/api/admin/settings?key=tax_rate');
        if (taxRateRes.ok) {
          const d = await taxRateRes.json();
          if (d.value) setSettings(s => ({ ...s, tax_rate: d.value }));
        }

        const ustRes = await fetch('/api/admin/settings?key=ust_id');
        if (ustRes.ok) {
          const d = await ustRes.json();
          if (d.value) setSettings(s => ({ ...s, ust_id: d.value }));
        }

        // DATEV Config
        const datevRes = await fetch('/api/admin/config?key=datev_config');
        if (datevRes.ok) {
          const d = await datevRes.json();
          if (d && d.erloeskonto) {
            setSettings(s => ({
              ...s,
              datev_erloeskonto: d.erloeskonto || s.datev_erloeskonto,
              datev_umsatzsteuerkonto: d.umsatzsteuerkonto || s.datev_umsatzsteuerkonto,
              datev_kautionskonto: d.kautionskonto || s.datev_kautionskonto,
              datev_versandkostenkonto: d.versandkostenkonto || s.datev_versandkostenkonto,
              datev_beraternummer: d.beraternummer || s.datev_beraternummer,
              datev_mandantennummer: d.mandantennummer || s.datev_mandantennummer,
              datev_wirtschaftsjahr_beginn: d.wirtschaftsjahr_beginn || s.datev_wirtschaftsjahr_beginn,
            }));
          }
        }

        // Mahnwesen Settings
        const settingsKeys = [
          'accounting_dunning_days_1', 'accounting_dunning_days_2', 'accounting_dunning_days_3',
          'accounting_dunning_fee_1', 'accounting_dunning_fee_2', 'accounting_dunning_fee_3',
          'accounting_payment_terms_days', 'accounting_invoice_footer',
        ];
        for (const key of settingsKeys) {
          const r = await fetch(`/api/admin/settings?key=${key}`);
          if (r.ok) {
            const d = await r.json();
            if (d.value) {
              const shortKey = key.replace('accounting_', '') as keyof BuchhaltungSettings;
              setSettings(s => ({ ...s, [shortKey]: d.value }));
            }
          }
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Steuermodus speichern
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'tax_mode', value: settings.tax_mode }),
      });
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'tax_rate', value: settings.tax_rate }),
      });
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ust_id', value: settings.ust_id }),
      });

      // DATEV Config
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'datev_config',
          value: {
            erloeskonto: settings.datev_erloeskonto,
            umsatzsteuerkonto: settings.datev_umsatzsteuerkonto,
            kautionskonto: settings.datev_kautionskonto,
            versandkostenkonto: settings.datev_versandkostenkonto,
            beraternummer: settings.datev_beraternummer,
            mandantennummer: settings.datev_mandantennummer,
            wirtschaftsjahr_beginn: settings.datev_wirtschaftsjahr_beginn,
          },
        }),
      });

      // Mahnwesen + Rechnungs-Defaults
      const accountingSettings: Record<string, string> = {
        accounting_dunning_days_1: settings.dunning_days_1,
        accounting_dunning_days_2: settings.dunning_days_2,
        accounting_dunning_days_3: settings.dunning_days_3,
        accounting_dunning_fee_1: settings.dunning_fee_1,
        accounting_dunning_fee_2: settings.dunning_fee_2,
        accounting_dunning_fee_3: settings.dunning_fee_3,
        accounting_payment_terms_days: settings.payment_terms_days,
        accounting_invoice_footer: settings.invoice_footer,
      };

      for (const [key, value] of Object.entries(accountingSettings)) {
        await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }

      showToast('Einstellungen gespeichert', 'ok');
    } catch {
      showToast('Fehler beim Speichern', 'err');
    } finally {
      setSaving(false);
    }
  }

  function updateSetting<K extends keyof BuchhaltungSettings>(key: K, value: BuchhaltungSettings[K]) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', background: '#0f172a', border: '1px solid #1e293b',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%',
  };

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Einstellungen laden...</div>;
  }

  return (
    <div style={{ maxWidth: 800 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 8, background: toast.type === 'ok' ? '#10b981' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14 }}>
          {toast.msg}
        </div>
      )}

      {/* Steuermodus */}
      <Section title="Steuermodus">
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          {(['kleinunternehmer', 'regelbesteuerung'] as const).map(mode => (
            <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '12px 20px', borderRadius: 8, border: `1px solid ${settings.tax_mode === mode ? '#06b6d4' : '#1e293b'}`, background: settings.tax_mode === mode ? 'rgba(6,182,212,0.08)' : 'transparent' }}>
              <input type="radio" name="tax_mode" checked={settings.tax_mode === mode} onChange={() => updateSetting('tax_mode', mode)} style={{ accentColor: '#06b6d4' }} />
              <span style={{ color: settings.tax_mode === mode ? '#06b6d4' : '#94a3b8', fontWeight: 600, fontSize: 14 }}>
                {getTaxModeLabel(mode)}
              </span>
            </label>
          ))}
        </div>
        {settings.tax_mode === 'regelbesteuerung' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Steuersatz (%)</label>
              <input type="number" value={settings.tax_rate} onChange={(e) => updateSetting('tax_rate', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>USt-IdNr.</label>
              <input value={settings.ust_id} onChange={(e) => updateSetting('ust_id', e.target.value)} placeholder="DE123456789" style={inputStyle} />
            </div>
          </div>
        )}
        <div style={{ marginTop: 12, padding: 12, background: 'rgba(245,158,11,0.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.15)' }}>
          <p style={{ color: '#f59e0b', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
            Wechsel zwischen Steuermodi sollte nur zum Jahreswechsel erfolgen. Bestehende Rechnungen bleiben unverändert.
          </p>
        </div>
      </Section>

      {/* DATEV-Konten */}
      <Section title="DATEV-Konten">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Erlöskonto</label>
            <input value={settings.datev_erloeskonto} onChange={(e) => updateSetting('datev_erloeskonto', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Umsatzsteuer-Konto</label>
            <input value={settings.datev_umsatzsteuerkonto} onChange={(e) => updateSetting('datev_umsatzsteuerkonto', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Kautionskonto</label>
            <input value={settings.datev_kautionskonto} onChange={(e) => updateSetting('datev_kautionskonto', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Versandkosten-Konto</label>
            <input value={settings.datev_versandkostenkonto} onChange={(e) => updateSetting('datev_versandkostenkonto', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Beraternummer</label>
            <input value={settings.datev_beraternummer} onChange={(e) => updateSetting('datev_beraternummer', e.target.value)} placeholder="z.B. 1234567" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Mandantennummer</label>
            <input value={settings.datev_mandantennummer} onChange={(e) => updateSetting('datev_mandantennummer', e.target.value)} placeholder="z.B. 12345" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Wirtschaftsjahr-Beginn</label>
            <select value={settings.datev_wirtschaftsjahr_beginn} onChange={(e) => updateSetting('datev_wirtschaftsjahr_beginn', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => (
                <option key={m} value={m}>{['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][parseInt(m) - 1]}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* Mahnwesen */}
      <Section title="Mahnwesen">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[1, 2, 3].map(level => (
            <div key={level} style={{ background: '#0f172a', borderRadius: 8, padding: 16, border: '1px solid #1e293b' }}>
              <h4 style={{ color: level === 1 ? '#f59e0b' : level === 2 ? '#f97316' : '#ef4444', fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>
                Stufe {level}
              </h4>
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Frist (Tage nach Fälligkeit)</label>
                <input
                  type="number"
                  value={settings[`dunning_days_${level}` as keyof BuchhaltungSettings] as string}
                  onChange={(e) => updateSetting(`dunning_days_${level}` as keyof BuchhaltungSettings, e.target.value as never)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Mahngebühr (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={settings[`dunning_fee_${level}` as keyof BuchhaltungSettings] as string}
                  onChange={(e) => updateSetting(`dunning_fee_${level}` as keyof BuchhaltungSettings, e.target.value as never)}
                  style={inputStyle}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Rechnungs-Defaults */}
      <Section title="Rechnungs-Defaults">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Zahlungsfrist (Tage)</label>
            <input type="number" value={settings.payment_terms_days} onChange={(e) => updateSetting('payment_terms_days', e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Footer-Text auf Rechnung</label>
          <textarea
            value={settings.invoice_footer}
            onChange={(e) => updateSetting('invoice_footer', e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      </Section>

      {/* Speichern-Button */}
      <div style={{ marginTop: 24, paddingBottom: 32 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 32px', borderRadius: 8, fontWeight: 700, fontSize: 15,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            background: '#06b6d4', color: '#0f172a', border: 'none',
          }}
        >
          {saving ? 'Speichere...' : 'Alle Einstellungen speichern'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4,
};

'use client';

import { useEffect, useState } from 'react';

/**
 * Puffer-Tage (Verfügbarkeit) — Tage vor und nach der Miete, in denen
 * Produkte und Zubehör blockiert bleiben. Versand-Puffer fuer Hin-/Rueckweg,
 * Abholung-Puffer fuer Bereitstellung/Reinigung.
 *
 * Speicherung: admin_settings.booking_buffer_days
 *   { versand_before, versand_after, abholung_before, abholung_after }
 */
export default function BufferDaysSection() {
  const [versandBefore, setVersandBefore] = useState('2');
  const [versandAfter, setVersandAfter] = useState('2');
  const [abholungBefore, setAbholungBefore] = useState('0');
  const [abholungAfter, setAbholungAfter] = useState('1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings?key=booking_buffer_days')
      .then((r) => r.json())
      .then((d) => {
        if (d.value) {
          const v = typeof d.value === 'string' ? JSON.parse(d.value) : d.value;
          if (v.versand_before !== undefined) setVersandBefore(String(v.versand_before));
          if (v.versand_after !== undefined) setVersandAfter(String(v.versand_after));
          if (v.abholung_before !== undefined) setAbholungBefore(String(v.abholung_before));
          if (v.abholung_after !== undefined) setAbholungAfter(String(v.abholung_after));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSuccess('');
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'booking_buffer_days',
          value: JSON.stringify({
            versand_before: parseInt(versandBefore) || 0,
            versand_after: parseInt(versandAfter) || 0,
            abholung_before: parseInt(abholungBefore) || 0,
            abholung_after: parseInt(abholungAfter) || 0,
          }),
        }),
      });
      setSuccess('Gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      // Fehler
    } finally {
      setSaving(false);
    }
  }

  const numInputStyle: React.CSSProperties = {
    width: 80, background: '#0a0f1e', border: '1px solid #1e293b',
    borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 14, textAlign: 'center',
  };

  return (
    <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24 }}>
      <div className="flex items-center gap-3 mb-4">
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f59e0b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg className="w-5 h-5" style={{ color: '#f59e0b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 className="font-heading font-semibold text-base" style={{ color: '#e2e8f0' }}>
            Puffer-Tage (Verfügbarkeit)
          </h2>
          <p className="text-xs" style={{ color: '#64748b' }}>
            Tage vor und nach der Miete, in denen Produkte und Zubehör blockiert bleiben
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 14 }}>Laden...</div>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="text-sm font-semibold mb-3" style={{ color: '#e2e8f0' }}>
              📦 Versand
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <input style={numInputStyle} type="number" min="0" max="14" value={versandBefore} onChange={(e) => setVersandBefore(e.target.value)} />
                <span className="text-xs" style={{ color: '#94a3b8' }}>Tage vorher blockiert</span>
              </div>
              <div className="flex items-center gap-2">
                <input style={numInputStyle} type="number" min="0" max="14" value={versandAfter} onChange={(e) => setVersandAfter(e.target.value)} />
                <span className="text-xs" style={{ color: '#94a3b8' }}>Tage nachher blockiert</span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-3" style={{ color: '#e2e8f0' }}>
              🏪 Abholung
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <input style={numInputStyle} type="number" min="0" max="14" value={abholungBefore} onChange={(e) => setAbholungBefore(e.target.value)} />
                <span className="text-xs" style={{ color: '#94a3b8' }}>Tage vorher blockiert</span>
              </div>
              <div className="flex items-center gap-2">
                <input style={numInputStyle} type="number" min="0" max="14" value={abholungAfter} onChange={(e) => setAbholungAfter(e.target.value)} />
                <span className="text-xs" style={{ color: '#94a3b8' }}>Tage nachher blockiert</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: '#f59e0b', color: '#0a0a0a' }}
            >
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
            {success && (
              <span className="text-sm" style={{ color: '#10b981' }}>{success}</span>
            )}
          </div>

          <div className="p-3 rounded-lg text-xs" style={{ background: '#f59e0b08', border: '1px solid #f59e0b20', color: '#94a3b8' }}>
            <strong style={{ color: '#fbbf24' }}>Beispiel Versand (2/2):</strong> Kunde mietet 10.–15. April → Kamera und Zubehör sind vom 8.–17. April blockiert (2 Tage Versandpuffer vor und nach der Miete).
          </div>
        </div>
      )}
    </div>
  );
}

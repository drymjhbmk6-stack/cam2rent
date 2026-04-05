'use client';

import { useState, useEffect } from 'react';

interface ChecklistItem {
  label: string;
  required: boolean;
  checked: boolean;
  comment: string;
  photos: string[];
}

interface Checklist {
  id: string;
  booking_id: string;
  items: ChecklistItem[];
  status: 'in_progress' | 'completed' | 'damage_reported';
  completed_at: string | null;
}

const C = {
  card: '#111827',
  border: '#1e293b',
  cyan: '#06b6d4',
  green: '#10b981',
  red: '#ef4444',
  yellow: '#f59e0b',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
};

export default function ReturnChecklist({ bookingId }: { bookingId: string }) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch(`/api/admin/return-checklist?bookingId=${bookingId}`)
      .then((r) => r.json())
      .then((d) => { if (d.checklist) setChecklist(d.checklist); })
      .catch(() => setError('Checkliste konnte nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  function toggleItem(index: number) {
    if (!checklist || checklist.status === 'completed') return;
    const items = [...checklist.items];
    items[index] = { ...items[index], checked: !items[index].checked };
    setChecklist({ ...checklist, items });
  }

  function updateComment(index: number, comment: string) {
    if (!checklist || checklist.status === 'completed') return;
    const items = [...checklist.items];
    items[index] = { ...items[index], comment };
    setChecklist({ ...checklist, items });
  }

  async function saveChecklist(complete = false) {
    if (!checklist) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/admin/return-checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          items: checklist.items,
          status: complete ? 'completed' : 'in_progress',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Fehler beim Speichern.'); return; }
      if (complete) {
        setChecklist({ ...checklist, status: 'completed', completed_at: new Date().toISOString() });
        setSuccess('Rückgabe abgeschlossen. Buchung wurde als abgeschlossen markiert.');
      } else {
        setSuccess('Gespeichert.');
        setTimeout(() => setSuccess(''), 2000);
      }
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setSaving(false);
    }
  }

  async function reportDamage() {
    if (!checklist) return;
    setSaving(true);
    try {
      await fetch('/api/admin/return-checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          items: checklist.items,
          status: 'damage_reported',
        }),
      });
      setChecklist({ ...checklist, status: 'damage_reported' });
      setSuccess('Schadensfall gemeldet.');
    } catch {
      setError('Fehler.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ width: 24, height: 24, border: '2px solid #06b6d4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
      </div>
    );
  }

  if (!checklist) return null;

  const allRequiredChecked = checklist.items.every((item) => !item.required || item.checked);
  const isCompleted = checklist.status === 'completed';
  const isDamage = checklist.status === 'damage_reported';

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Rückgabe-Checkliste</h3>
        {isCompleted && (
          <span style={{ fontSize: 12, fontWeight: 600, color: C.green, background: `${C.green}20`, padding: '3px 10px', borderRadius: 20 }}>
            Abgeschlossen
          </span>
        )}
        {isDamage && (
          <span style={{ fontSize: 12, fontWeight: 600, color: C.red, background: `${C.red}20`, padding: '3px 10px', borderRadius: 20 }}>
            Schaden gemeldet
          </span>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: `${C.red}15`, border: `1px solid ${C.red}40`, color: C.red, fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: `${C.green}15`, border: `1px solid ${C.green}40`, color: C.green, fontSize: 13 }}>
          {success}
        </div>
      )}

      {/* Checklist items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {checklist.items.map((item, i) => (
          <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: isCompleted ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => toggleItem(i)}
                disabled={isCompleted}
                style={{ marginTop: 2, accentColor: C.cyan }}
              />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 14, color: item.checked ? C.green : C.text, fontWeight: 500 }}>
                  {item.label}
                </span>
                {item.required && (
                  <span style={{ fontSize: 10, color: C.red, marginLeft: 6 }}>Pflicht</span>
                )}
              </div>
            </label>

            {/* Comment field (for damage items or when item has focus) */}
            {!isCompleted && (
              <div style={{ marginTop: 8, marginLeft: 26 }}>
                <input
                  type="text"
                  value={item.comment}
                  onChange={(e) => updateComment(i, e.target.value)}
                  placeholder="Kommentar (optional)"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: 12,
                    background: '#0a0f1e',
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    color: C.text,
                    outline: 'none',
                  }}
                />
              </div>
            )}
            {isCompleted && item.comment && (
              <div style={{ marginTop: 4, marginLeft: 26, fontSize: 12, color: C.textMuted }}>
                {item.comment}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      {!isCompleted && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => saveChecklist(false)}
            disabled={saving}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: 'transparent',
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              color: C.textMuted,
              cursor: 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Zwischenspeichern
          </button>
          <button
            onClick={reportDamage}
            disabled={saving}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: `${C.red}20`,
              border: `1px solid ${C.red}60`,
              borderRadius: 8,
              color: C.red,
              cursor: 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Schadensfall melden
          </button>
          <button
            onClick={() => saveChecklist(true)}
            disabled={saving || !allRequiredChecked}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: allRequiredChecked ? C.green : `${C.green}30`,
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: allRequiredChecked ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Rückgabe abschließen
          </button>
        </div>
      )}

      {isCompleted && checklist.completed_at && (
        <p style={{ marginTop: 12, fontSize: 12, color: C.textDim }}>
          Abgeschlossen am {new Date(checklist.completed_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Persönliche Push-Einstellungen: der eingeloggte Admin wählt, welche
 * Benachrichtigungs-Typen als Push auf sein Gerät kommen. Verengt zusätzlich
 * zum Permission-Filter (man sieht ohnehin nur Typen der eigenen Bereiche).
 *
 * Speicherung: /api/admin/push/preferences (muted = abgewählte Typen).
 */

type TypeDef = { type: string; label: string; group: string };

export default function PushPreferencesSection() {
  const [types, setTypes] = useState<TypeDef[]>([]);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [legacy, setLegacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/push/preferences');
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setErr(data?.error ?? 'Konnte Einstellungen nicht laden.');
          return;
        }
        setTypes(data.types ?? []);
        setMuted(new Set<string>(data.muted ?? []));
        setLegacy(!!data.legacy);
      } catch {
        if (alive) setErr('Konnte Einstellungen nicht laden.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, TypeDef[]>();
    for (const t of types) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group)!.push(t);
    }
    return [...map.entries()];
  }, [types]);

  function toggle(type: string) {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setMsg('');
  }

  async function save() {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const res = await fetch('/api/admin/push/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: [...muted] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? 'Speichern fehlgeschlagen.');
        return;
      }
      setMsg('Gespeichert.');
    } catch {
      setErr('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-brand-border dark:border-slate-700 p-6 mb-8">
      <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        Welche Push-Benachrichtigungen möchtest du?
      </h2>
      <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-4">
        Wähle ab, was dich nicht auf dein Gerät buzzen soll. Es werden nur Typen
        aus deinen Bereichen angezeigt. Im Benachrichtigungs-Center (Glocke)
        bleibt trotzdem alles sichtbar.
      </p>

      {legacy ? (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
          <p className="text-sm font-body text-amber-800 dark:text-amber-200">
            Du bist über das ENV-Notfall-Passwort angemeldet — persönliche
            Einstellungen sind nur für richtige Mitarbeiter-Konten möglich.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {groups.map(([group, items]) => (
              <div key={group}>
                <div className="text-xs font-heading font-semibold text-brand-muted dark:text-gray-400 uppercase tracking-wide mb-2">
                  {group}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((t) => {
                    const on = !muted.has(t.type);
                    return (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => toggle(t.type)}
                        className="flex items-center gap-2 text-left rounded-lg px-3 py-2 border transition-colors"
                        style={{
                          background: on ? 'rgba(6,182,212,0.08)' : 'transparent',
                          borderColor: on ? '#06b6d4' : 'rgba(148,163,184,0.4)',
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                          style={{
                            borderColor: on ? '#06b6d4' : '#94a3b8',
                            background: on ? '#06b6d4' : 'transparent',
                          }}
                        >
                          {on && (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span className="text-sm font-body text-brand-black dark:text-white">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-accent-cyan text-white text-sm font-heading font-semibold rounded-btn hover:bg-cyan-700 transition-colors disabled:opacity-40"
            >
              {saving ? 'Speichere…' : 'Speichern'}
            </button>
            {msg && <span className="text-xs text-green-600 dark:text-green-400 font-body">{msg}</span>}
            {err && <span className="text-xs text-red-600 dark:text-red-400 font-body">{err}</span>}
          </div>
        </>
      )}
    </div>
  );
}

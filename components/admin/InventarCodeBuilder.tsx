'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Wiederverwendbarer 4-Segment Inventar-Code-Builder
 * (Kategorie-Hersteller-Name-LaufendeNr, z.B. BAT-DJI-1950-01).
 *
 * Selbstverwaltend: haelt seg1-4 intern, laedt Code-Segmente +
 * Seg3-Vorschlaege + naechste Laufende-Nr selbst und meldet den fertigen
 * Code per onChange nach oben. Genutzt von /admin/inventar/neu (dark) und
 * dem Sammel-Zubehoer-Formular in /admin/zubehoer (light).
 */

interface CodeSegment {
  id: string;
  typ: 'kategorie' | 'hersteller';
  code: string;
  label: string;
}

interface Seg3Suggestion {
  name: string;
  count: number;
}

const THEME = {
  dark: {
    box: 'border-slate-800 bg-slate-900/40',
    label: 'text-slate-400',
    subLabel: 'text-slate-500',
    link: 'text-cyan-400 hover:text-cyan-300',
    warn: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    field: 'bg-[#0a0f1e] border-slate-700',
    fieldDisabled: 'disabled:bg-slate-800 disabled:text-slate-500',
    seg4: 'bg-slate-800 border-slate-700 text-slate-300',
    divider: 'border-slate-800',
    preview: 'text-cyan-300',
    previewEmpty: 'text-slate-600',
  },
  light: {
    box: 'border-brand-border bg-brand-bg',
    label: 'text-brand-muted',
    subLabel: 'text-brand-muted',
    link: 'text-accent-blue hover:underline',
    warn: 'bg-amber-50 border-amber-300 text-amber-700',
    field: 'bg-white border-brand-border',
    fieldDisabled: 'disabled:bg-brand-bg disabled:text-brand-muted',
    seg4: 'bg-brand-bg border-brand-border text-brand-muted',
    divider: 'border-brand-border',
    preview: 'text-accent-blue',
    previewEmpty: 'text-brand-muted',
  },
} as const;

export default function InventarCodeBuilder({
  value,
  onChange,
  variant = 'dark',
}: {
  value: string;
  onChange: (code: string) => void;
  variant?: 'dark' | 'light';
}) {
  const t = THEME[variant];

  const [seg1, setSeg1] = useState('');
  const [seg2, setSeg2] = useState('');
  const [seg3, setSeg3] = useState('');
  const [seg4, setSeg4] = useState('01');
  const [seg4Loading, setSeg4Loading] = useState(false);
  const [codeSegmente, setCodeSegmente] = useState<CodeSegment[]>([]);
  const [seg3Suggestions, setSeg3Suggestions] = useState<Seg3Suggestion[]>([]);

  const inventarCode = seg1 && seg2 && seg3
    ? `${seg1}-${seg2}-${seg3.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${seg4}`
    : '';

  // Code-Segmente (Kategorie + Hersteller) laden
  useEffect(() => {
    fetch('/api/admin/inventar/code-segmente')
      .then((r) => (r.ok ? r.json() : { segmente: [] }))
      .then((data) => setCodeSegmente(data.segmente ?? []))
      .catch(() => setCodeSegmente([]));
  }, []);

  // Bei Seg1+Seg2-Wechsel: Seg3-Vorschlaege laden
  useEffect(() => {
    if (!seg1 || !seg2) {
      setSeg3Suggestions([]);
      return;
    }
    const sp = new URLSearchParams({ seg1, seg2 });
    fetch(`/api/admin/inventar/seg3-suggestions?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((data) => setSeg3Suggestions(data.suggestions ?? []))
      .catch(() => setSeg3Suggestions([]));
  }, [seg1, seg2]);

  // Bei vollstaendiger Seg1-3 Kombi: naechste Nummer berechnen
  useEffect(() => {
    if (!seg1 || !seg2 || !seg3) {
      setSeg4('01');
      return;
    }
    const cleanedSeg3 = seg3.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanedSeg3) return;
    setSeg4Loading(true);
    const sp = new URLSearchParams({ seg1, seg2, seg3: cleanedSeg3 });
    fetch(`/api/admin/inventar/next-code-number?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.seg4) setSeg4(data.seg4);
      })
      .catch(() => { /* default bleibt 01 */ })
      .finally(() => setSeg4Loading(false));
  }, [seg1, seg2, seg3]);

  // Fertigen Code nach oben melden
  useEffect(() => {
    if (inventarCode !== value) onChange(inventarCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventarCode]);

  const kategorien = codeSegmente.filter((s) => s.typ === 'kategorie');
  const hersteller = codeSegmente.filter((s) => s.typ === 'hersteller');
  const noStammdaten = codeSegmente.length === 0;

  return (
    <div className={`border ${t.box} rounded p-3 space-y-3`}>
      <div className="flex items-baseline justify-between">
        <label className={`block text-sm ${t.label}`}>Inventar-Code *</label>
        <Link href="/admin/inventar/code-segmente" className={`text-xs ${t.link}`}>
          Stammdaten pflegen ↗
        </Link>
      </div>

      {noStammdaten && (
        <div className={`px-3 py-2 border ${t.warn} rounded text-xs`}>
          ⚠ Noch keine Code-Segmente angelegt. Bitte zuerst{' '}
          <Link href="/admin/inventar/code-segmente" className="underline">Stammdaten</Link> pflegen.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div>
          <label className={`block text-[11px] ${t.subLabel} mb-1`}>Kategorie</label>
          <select value={seg1} onChange={(e) => setSeg1(e.target.value)} className={`w-full border ${t.field} rounded px-2 py-1.5 text-sm font-mono`}>
            <option value="">—</option>
            {kategorien.map((k) => (
              <option key={k.id} value={k.code}>{k.code} · {k.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-[11px] ${t.subLabel} mb-1`}>Hersteller</label>
          <select value={seg2} onChange={(e) => setSeg2(e.target.value)} className={`w-full border ${t.field} rounded px-2 py-1.5 text-sm font-mono`}>
            <option value="">—</option>
            {hersteller.map((h) => (
              <option key={h.id} value={h.code}>{h.code} · {h.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-[11px] ${t.subLabel} mb-1`}>
            Name {seg3Suggestions.length > 0 && <span className="opacity-70">({seg3Suggestions.length} bekannt)</span>}
          </label>
          <input
            list="inv-code-seg3-list"
            value={seg3}
            onChange={(e) => setSeg3(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="z.B. 128"
            disabled={!seg1 || !seg2}
            className={`w-full border ${t.field} ${t.fieldDisabled} rounded px-2 py-1.5 text-sm font-mono`}
          />
          <datalist id="inv-code-seg3-list">
            {seg3Suggestions.map((s) => (
              <option key={s.name} value={s.name}>{s.count}× vorhanden</option>
            ))}
          </datalist>
        </div>

        <div>
          <label className={`block text-[11px] ${t.subLabel} mb-1`}>
            Laufende Nr {seg4Loading && <span className="opacity-70">(berechne…)</span>}
          </label>
          <input
            value={seg4}
            readOnly
            className={`w-full border ${t.seg4} rounded px-2 py-1.5 text-sm font-mono cursor-not-allowed`}
          />
        </div>
      </div>

      <div className={`pt-2 border-t ${t.divider}`}>
        <div className={`text-[11px] ${t.subLabel} mb-1`}>Code wird:</div>
        <div className={`font-mono text-base ${t.preview}`}>
          {inventarCode || <span className={`${t.previewEmpty} italic`}>— Bitte alle 4 Segmente füllen —</span>}
        </div>
      </div>
    </div>
  );
}

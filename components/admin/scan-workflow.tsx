'use client';

/**
 * Wiederverwendbarer Scan-Workflow für Pack- und Retouren-Seiten.
 *
 * Enthaelt:
 *  - Datenmodell (ResolvedItem, UnitCode, PackItem, GroupedItem)
 *  - expandItems() / groupItems() — pro Stueck einen Slot, dann fuer die UI
 *    aggregiert pro Kategorie
 *  - buildScanLookup() / applyScan() — lokaler Match auf reservierte Codes
 *    plus Server-Lookup-Fallback fuer Substitution / Klartext-Fehler
 *  - <ItemList> — aggregierte Anzeige mit Mengen-Counter und +/- Logik
 *  - <ScannerBar> — Auf-Knopf mit Counter X/Y
 *  - <ScannerLiveList> — Inhalt fuer den continuous-Scanner-Modus (kompakte
 *    Item-Liste + Scan-Feedback unter dem Kamera-Stream)
 */

import { useMemo, useState } from 'react';

// ─── Datenmodell ─────────────────────────────────────────────────────────────

export interface ResolvedItem {
  id: string;
  name: string;
  qty: number;
  isFromSet?: boolean;
  setName?: string;
}

export interface UnitCode {
  id: string;
  accessory_id: string;
  exemplar_code: string;
}

export interface PackItem {
  key: string;
  label: string;
  subLabel: string;
  type: 'camera' | 'accessory' | 'return-label';
  accessoryId?: string;
}

export interface GroupedItem {
  groupKey: string;
  type: 'camera' | 'accessory' | 'return-label';
  label: string;
  subLabel: string;
  slotKeys: string[];
}

export interface ScanLookup {
  cameraSerial: string | null;
  cameraUnitId: string | null;
  codeToAccessory: Map<string, string>;
  codeToUnit: Map<string, string>;
  scannableCount: number;
}

export interface ScanWorkflowInput {
  productName: string;
  serialNumber?: string | null;
  resolvedItems?: ResolvedItem[];
  unitCodes?: UnitCode[];
  unitId?: string | null;
  /**
   * Wenn true, wird KEIN "Rücksendeetikett beilegen"-Slot angehaengt.
   * Sinnvoll fuer den Retouren-Workflow.
   */
  skipReturnLabel?: boolean;
}

export interface ScanResult {
  ok: boolean;
  alreadyChecked?: boolean;
  key?: string;
  message: string;
  scannedUnitId?: string;
  scannedKind?: 'camera' | 'accessory';
  isSubstitute?: boolean;
  substituteCode?: string;
}

interface ServerScanLookup {
  kind: 'camera' | 'accessory' | 'unknown';
  productId?: string;
  productName?: string;
  accessoryId?: string;
  accessoryName?: string;
  unitId?: string;
  serialNumber?: string;
  exemplarCode?: string;
  matchesBooking?: boolean;
  conflict?: { bookingId: string; customerName: string | null } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeCode(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '');
}

export function expandItems(b: ScanWorkflowInput): PackItem[] {
  const items = b.resolvedItems ?? [];
  const usedSetNames = new Set<string>();
  for (const it of items) {
    if (it.isFromSet && it.setName) usedSetNames.add(it.setName);
  }
  const out: PackItem[] = [];
  out.push({
    key: 'camera',
    type: 'camera',
    label: b.productName,
    subLabel: b.serialNumber ? `Seriennummer: ${b.serialNumber}` : 'Kamera',
  });
  for (const it of items) {
    if (!it.isFromSet && usedSetNames.has(it.name)) continue;
    for (let i = 0; i < it.qty; i++) {
      out.push({
        key: `${it.id}::${i}`,
        type: 'accessory',
        accessoryId: it.id,
        label: it.name,
        subLabel: it.isFromSet && it.setName ? `Im Set: ${it.setName}` : 'Zubehör',
      });
    }
  }
  if (!b.skipReturnLabel) {
    out.push({
      key: 'return-label',
      type: 'return-label',
      label: 'Rücksendeetikett beilegen',
      subLabel: 'DHL / DPD / etc.',
    });
  }
  return out;
}

export function groupItems(items: PackItem[]): GroupedItem[] {
  const out: GroupedItem[] = [];
  const map = new Map<string, GroupedItem>();
  for (const it of items) {
    const key = it.type === 'camera' ? 'camera'
              : it.type === 'return-label' ? 'return-label'
              : (it.accessoryId ?? it.key);
    const existing = map.get(key);
    if (existing) {
      existing.slotKeys.push(it.key);
    } else {
      const g: GroupedItem = {
        groupKey: key,
        type: it.type,
        label: it.label,
        subLabel: it.subLabel,
        slotKeys: [it.key],
      };
      map.set(key, g);
      out.push(g);
    }
  }
  return out;
}

export function groupCheckedCount(g: GroupedItem, checked: Record<string, boolean>): number {
  let n = 0;
  for (const k of g.slotKeys) if (checked[k]) n++;
  return n;
}

export function buildScanLookup(b: ScanWorkflowInput): ScanLookup {
  const codeToAccessory = new Map<string, string>();
  const codeToUnit = new Map<string, string>();
  for (const u of b.unitCodes ?? []) {
    if (u.exemplar_code) {
      const norm = normalizeCode(u.exemplar_code);
      codeToAccessory.set(norm, u.accessory_id);
      codeToUnit.set(norm, u.id);
    }
  }
  return {
    cameraSerial: b.serialNumber ? normalizeCode(b.serialNumber) : null,
    cameraUnitId: b.unitId ?? null,
    codeToAccessory,
    codeToUnit,
    scannableCount: (b.serialNumber ? 1 : 0) + codeToAccessory.size,
  };
}

/**
 * Loest einen gescannten Code in einen Slot-Hit auf:
 *  1) Lokaler Match gegen die in der Buchung reservierten Codes
 *  2) Andernfalls Server-Lookup ueber /api/admin/scan-lookup — entweder
 *     Substitution erlaubt oder Klartext-Fehler "X wird nicht benoetigt"
 *
 * `allowSubstitution=false` wird vom Kontroll-Schritt und vom Retouren-
 * Workflow verwendet — dort darf nichts mehr getauscht werden.
 */
export async function applyScan(
  rawCode: string,
  bookingId: string,
  items: PackItem[],
  checked: Record<string, boolean>,
  lookup: ScanLookup,
  scannedUnitIds: Set<string>,
  allowSubstitution: boolean = true,
): Promise<ScanResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, message: 'Leerer Code.' };

  if (lookup.cameraSerial && lookup.cameraSerial === code) {
    if (checked['camera']) {
      return { ok: false, alreadyChecked: true, message: `Kamera (${rawCode}) schon abgehakt.` };
    }
    return {
      ok: true,
      key: 'camera',
      message: `✓ Kamera (${rawCode})`,
      scannedKind: 'camera',
      scannedUnitId: lookup.cameraUnitId ?? undefined,
    };
  }

  const accId = lookup.codeToAccessory.get(code);
  if (accId) {
    const localUnitId = lookup.codeToUnit.get(code);
    if (localUnitId && scannedUnitIds.has(localUnitId)) {
      return { ok: false, alreadyChecked: true, message: `Code ${rawCode} schon gescannt.` };
    }
    const slots = items.filter((it) => it.type === 'accessory' && it.accessoryId === accId);
    const free = slots.find((it) => !checked[it.key]);
    if (!free) {
      return { ok: false, alreadyChecked: true, message: `Alle ${slots[0]?.label ?? 'Slots'} schon abgehakt.` };
    }
    return {
      ok: true,
      key: free.key,
      message: `✓ ${free.label}`,
      scannedKind: 'accessory',
      scannedUnitId: localUnitId,
    };
  }

  let info: ServerScanLookup;
  try {
    const res = await fetch('/api/admin/scan-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, bookingId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    info = await res.json();
  } catch {
    return { ok: false, message: `Code ${rawCode} unbekannt.` };
  }

  if (info.kind === 'unknown') {
    return { ok: false, message: `Code ${rawCode} ist im System nicht hinterlegt.` };
  }
  if (info.unitId && scannedUnitIds.has(info.unitId)) {
    return { ok: false, alreadyChecked: true, message: `Code ${rawCode} schon abgehakt.` };
  }
  if (info.conflict) {
    const cust = info.conflict.customerName ? ` (${info.conflict.customerName})` : '';
    const itemLabel = info.kind === 'camera' ? info.productName ?? 'Kamera' : info.accessoryName ?? 'Zubehör';
    return {
      ok: false,
      message: `${itemLabel} (${rawCode}) ist bereits Buchung ${info.conflict.bookingId}${cust} zugeordnet.`,
    };
  }

  if (info.kind === 'camera') {
    if (!info.matchesBooking) {
      return { ok: false, message: `Kamera „${info.productName ?? rawCode}" wird nicht benötigt.` };
    }
    if (!allowSubstitution) {
      return { ok: false, message: `Diese Kamera passt nicht zu dieser Buchung — bitte gegen die Seriennummer der Buchung pruefen.` };
    }
    if (checked['camera']) {
      return { ok: false, alreadyChecked: true, message: `Kamera schon abgehakt.` };
    }
    return {
      ok: true,
      key: 'camera',
      message: `✓ Kamera ersetzt: ${info.serialNumber ?? rawCode}`,
      scannedKind: 'camera',
      scannedUnitId: info.unitId,
      isSubstitute: true,
      substituteCode: info.serialNumber ?? rawCode,
    };
  }

  if (!info.matchesBooking) {
    return { ok: false, message: `Zubehör „${info.accessoryName ?? rawCode}" wird nicht benötigt.` };
  }
  if (!allowSubstitution) {
    return { ok: false, message: `Dieses „${info.accessoryName}" passt nicht zu dieser Buchung — bitte gegen den Buchungs-Code pruefen.` };
  }
  const slots = items.filter((it) => it.type === 'accessory' && it.accessoryId === info.accessoryId);
  const free = slots.find((it) => !checked[it.key]);
  if (!free) {
    return { ok: false, alreadyChecked: true, message: `Alle „${info.accessoryName}" schon abgehakt.` };
  }
  return {
    ok: true,
    key: free.key,
    message: `✓ ${free.label} ersetzt: ${info.exemplarCode ?? rawCode}`,
    scannedKind: 'accessory',
    scannedUnitId: info.unitId,
    isSubstitute: true,
    substituteCode: info.exemplarCode ?? rawCode,
  };
}

// ─── React Hook fuer den Scan-State ──────────────────────────────────────────

/**
 * Sammelt den State, den jede Pack-/Retouren-Page braucht: aggregierte
 * Gruppen, Counter, Inkrement-/Dekrement-Helper. Der `checked`-State wird
 * weiterhin als Record<slotKey, boolean> gehalten — die Pack-API bekommt
 * dadurch unveraendert die Liste der Slot-Keys.
 */
export function useScanGroups(items: PackItem[]) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => groupItems(items), [items]);

  const totalPackable = useMemo(
    () => items.filter((it) => it.type !== 'return-label').length,
    [items],
  );
  const checkedPackable = useMemo(
    () => items.filter((it) => it.type !== 'return-label' && checked[it.key]).length,
    [items, checked],
  );

  function incGroup(g: GroupedItem) {
    const next = g.slotKeys.find((k) => !checked[k]);
    if (next) setChecked((p) => ({ ...p, [next]: true }));
  }
  function decGroup(g: GroupedItem) {
    for (let i = g.slotKeys.length - 1; i >= 0; i--) {
      if (checked[g.slotKeys[i]]) {
        const k = g.slotKeys[i];
        setChecked((p) => ({ ...p, [k]: false }));
        return;
      }
    }
  }

  return { checked, setChecked, groups, totalPackable, checkedPackable, incGroup, decGroup };
}

// ─── UI-Komponenten ──────────────────────────────────────────────────────────

export function ItemList({
  groups, checked, onIncrement, onDecrement, compact,
}: {
  groups: GroupedItem[];
  checked: Record<string, boolean>;
  onIncrement: (g: GroupedItem) => void;
  onDecrement: (g: GroupedItem) => void;
  compact?: boolean;
}) {
  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800">
      {groups.map((g) => {
        const checkedCount = groupCheckedCount(g, checked);
        const total = g.slotKeys.length;
        const fullyChecked = checkedCount === total;
        const partiallyChecked = checkedCount > 0 && !fullyChecked;
        const showCounter = total > 1;
        return (
          <div
            key={g.groupKey}
            className={`flex items-start gap-3 ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${
              fullyChecked ? 'bg-emerald-500/5' : partiallyChecked ? 'bg-amber-500/5' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => onIncrement(g)}
              aria-label="Abhaken"
              className={`mt-0.5 w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                fullyChecked ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                  : partiallyChecked ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                  : 'border-slate-600 hover:border-slate-400'
              }`}
            >
              {fullyChecked ? <span className="font-bold">✓</span>
                : partiallyChecked ? <span className="text-xs font-bold">{checkedCount}</span>
                : null}
            </button>
            <button
              type="button"
              onClick={() => onIncrement(g)}
              className="flex-1 min-w-0 text-left"
            >
              <div className={`font-semibold ${compact ? 'text-sm' : ''} ${
                fullyChecked ? 'text-emerald-300' : 'text-slate-100'
              }`}>
                {g.label}
              </div>
              {!compact && (
                <div className="text-xs text-slate-500 mt-0.5">{g.subLabel}</div>
              )}
            </button>
            {showCounter && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-mono tabular-nums ${
                  fullyChecked ? 'text-emerald-400' : partiallyChecked ? 'text-amber-300' : 'text-slate-500'
                }`}>
                  {checkedCount}/{total}
                </span>
                {checkedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onDecrement(g)}
                    aria-label="Eins zurueck"
                    className="w-7 h-7 rounded border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-500 flex items-center justify-center text-base leading-none"
                  >
                    −
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type ScanFeedback = { type: 'ok' | 'warn' | 'err'; msg: string } | null;

export function ScannerBar({
  onOpen, feedback, totalCount, checkedCount,
}: {
  onOpen: () => void;
  feedback: ScanFeedback;
  totalCount: number;
  checkedCount: number;
}) {
  if (totalCount === 0) return null;
  const fbColor = feedback?.type === 'ok'
    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
    : feedback?.type === 'warn'
      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
      : 'bg-red-500/15 border-red-500/40 text-red-300';
  const allDone = checkedCount >= totalCount;
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3 text-cyan-300">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>
          </svg>
          <div className="text-left">
            <div className="font-semibold text-sm">Scanner öffnen</div>
            <div className="text-xs text-cyan-400/80">Item-Code scannen → wird automatisch abgehakt</div>
          </div>
        </div>
        <div className={`text-sm font-semibold tabular-nums ${allDone ? 'text-emerald-400' : 'text-cyan-300/90'}`}>
          {checkedCount}/{totalCount}
        </div>
      </button>
      {feedback && (
        <div className={`mt-2 px-3 py-2 rounded-lg border text-sm ${fbColor}`}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
}

/** Inhalt fuer den continuous-Scanner-Modus — wird als children an SerialScanner uebergeben. */
export function ScannerLiveList({
  groups, checked, feedback, onIncrement, onDecrement,
}: {
  groups: GroupedItem[];
  checked: Record<string, boolean>;
  feedback: ScanFeedback;
  onIncrement: (g: GroupedItem) => void;
  onDecrement: (g: GroupedItem) => void;
}) {
  const visible = groups.filter((g) => g.type !== 'return-label');
  const fbColor = feedback?.type === 'ok'
    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
    : feedback?.type === 'warn'
      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
      : 'bg-red-500/15 border-red-500/40 text-red-300';
  return (
    <div className="space-y-2">
      {feedback && (
        <div className={`px-3 py-2 rounded-lg border text-xs ${fbColor}`}>
          {feedback.msg}
        </div>
      )}
      <ItemList
        groups={visible}
        checked={checked}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
        compact
      />
    </div>
  );
}

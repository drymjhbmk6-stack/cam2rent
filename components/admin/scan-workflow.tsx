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

import { useEffect, useMemo, useState } from 'react';

// ─── Datenmodell ─────────────────────────────────────────────────────────────

export interface ResolvedItem {
  id: string;
  name: string;
  qty: number;
  isFromSet?: boolean;
  setName?: string;
  /** Bestandteile dieses Zubehoers (z.B. "2x Sender", "1x Windschutz").
   *  Werden im Pack-Workflow als Hinweis angezeigt — kein eigener Slot. */
  included_parts?: string[];
  /** Bilder zu included_parts, paarweise per Index (leerer String = kein Bild). */
  included_parts_images?: string[];
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
  /** Bestandteile dieses Zubehoers (Anzeige-Hinweis, kein Slot). */
  includedParts?: string[];
  /** Bilder zu includedParts, paarweise per Index (leerer String = kein Bild). */
  includedPartsImages?: string[];
}

export interface GroupedItem {
  groupKey: string;
  type: 'camera' | 'accessory' | 'return-label';
  label: string;
  subLabel: string;
  slotKeys: string[];
  /** Bestandteile (aggregiert vom ersten Item der Gruppe). */
  includedParts?: string[];
  /** Bilder zu includedParts, paarweise per Index. */
  includedPartsImages?: string[];
}

export interface ScanLookup {
  cameraSerial: string | null;
  cameraUnitId: string | null;
  /** Pro Kamera-Slot: Slot-Key + (normalisierte) Seriennr + unit_id. */
  cameraSlots: { key: string; serial: string | null; unitId: string | null }[];
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
   * Multi-Kamera: pro physischer Kamera Name + eigene Seriennr + unit_id.
   * Wenn gesetzt, hat das Vorrang vor productName-Split + serialNumber.
   */
  cameras?: { product_name: string; serial_number?: string | null; unit_id?: string | null }[];
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
  /** Bei Sammel-Zubehoer (ein QR fuer N Stueck) werden mit einem Scan ALLE
   *  noch offenen Slots dieser Position abgehakt — der Aufrufer setzt jeden
   *  Key aus dieser Liste. Wenn gesetzt, hat sie Vorrang vor `key`. */
  keys?: string[];
  message: string;
  scannedUnitId?: string;
  scannedKind?: 'camera' | 'accessory';
  /** Bei accessory: die accessory_id der getroffenen Position. Wird vom
   *  Helper `applyScanResult` genutzt, um race-sicher den nächsten freien
   *  Slot derselben Position zu finden, falls der vorgeschlagene `key`
   *  durch schnelle Folge-Scans zwischenzeitlich abgehakt wurde. */
  accessoryId?: string;
  isSubstitute?: boolean;
  substituteCode?: string;
  /** Bestandteile des gescannten Items (z.B. "2x Sender", "Windschutz").
   *  Werden im Scanner-Toast als zusaetzlicher Hinweis ausgegeben, damit der
   *  Packer daran denkt, alle Teile mit einzupacken. */
  includedParts?: string[];
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
  /** true = Sammel-Zubehoer (ein gemeinsamer QR fuer alle Stueck). */
  isBulk?: boolean;
  matchesBooking?: boolean;
  conflict?: { bookingId: string; customerName: string | null } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeCode(s: string): string {
  let v = s.trim();
  // Der cam2rent-QR auf den Inventar-Etiketten enthaelt KEINEN nackten Code,
  // sondern eine Info-URL: https://cam2rent.de/admin/scan/<code>. Wenn so ein
  // Link gescannt wird, ziehen wir den <code>-Teil raus (URL-decoded), sonst
  // wuerde der Match gegen Seriennummer/Exemplar-Code immer fehlschlagen.
  const m = v.match(/\/admin\/scan\/([^/?#]+)/i);
  if (m) {
    try {
      v = decodeURIComponent(m[1]);
    } catch {
      v = m[1];
    }
  }
  return v.trim().toUpperCase().replace(/\s+/g, '');
}

export function expandItems(b: ScanWorkflowInput): PackItem[] {
  const items = b.resolvedItems ?? [];
  const usedSetNames = new Set<string>();
  for (const it of items) {
    if (it.isFromSet && it.setName) usedSetNames.add(it.setName);
  }
  const out: PackItem[] = [];
  // Mehrere Kameras (Warenkorb-Buchung): productName ist kommagetrennt
  // ("OSMO Action 5 Pro , DJI Osmo Nano 128 GB"). Pro Kamera ein Slot. Der
  // erste behaelt key 'camera' (scanbar, Seriennummer), die weiteren sind
  // manuell abzuhaken. Die Anzeige gruppiert in groupItems pro MODELL —
  // gleiches Modell zu einem "N/M"-Block, verschiedene Modelle getrennt.
  const camArr: { name: string; serial: string | null }[] =
    Array.isArray(b.cameras) && b.cameras.length > 0
      ? b.cameras.map((c) => ({ name: c.product_name, serial: c.serial_number ?? null }))
      : (b.productName ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((nm, i) => ({ name: nm, serial: i === 0 ? (b.serialNumber ?? null) : null }));
  const camList = camArr.length > 0 ? camArr : [{ name: b.productName, serial: b.serialNumber ?? null }];
  camList.forEach((cam, i) => {
    out.push({
      key: i === 0 ? 'camera' : `camera::${i}`,
      type: 'camera',
      label: cam.name,
      subLabel: cam.serial ? `Seriennummer: ${cam.serial}` : 'Kamera',
    });
  });
  for (const it of items) {
    if (!it.isFromSet && usedSetNames.has(it.name)) continue;
    const parts = Array.isArray(it.included_parts) && it.included_parts.length > 0
      ? it.included_parts
      : undefined;
    const partsImages = parts && Array.isArray(it.included_parts_images) && it.included_parts_images.length > 0
      ? it.included_parts_images
      : undefined;
    for (let i = 0; i < it.qty; i++) {
      out.push({
        key: `${it.id}::${i}`,
        type: 'accessory',
        accessoryId: it.id,
        label: it.name,
        subLabel: it.isFromSet && it.setName ? `Im Set: ${it.setName}` : 'Zubehör',
        includedParts: parts,
        includedPartsImages: partsImages,
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
    // Kameras nach MODELL gruppieren (nicht hart auf 'camera'): bei einer
    // gemischten Multi-Kamera-Buchung (z.B. "OSMO Action 5 Pro" + "DJI Osmo
    // Nano 128 GB") wuerden sonst beide unter dem Namen der ERSTEN Kamera mit
    // Zaehler 0/2 zusammengefasst — der Packer saehe zweimal dasselbe Modell.
    // Gleiches Modell aggregiert weiter zu EINEM "0/2"-Block.
    const key = it.type === 'camera' ? `camera::${(it.label ?? '').trim().toLowerCase()}`
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
        includedParts: it.includedParts,
        includedPartsImages: it.includedPartsImages,
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
  const camSrc: { serial: string | null; unitId: string | null }[] =
    Array.isArray(b.cameras) && b.cameras.length > 0
      ? b.cameras.map((c) => ({ serial: c.serial_number ?? null, unitId: c.unit_id ?? null }))
      : (b.productName ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((_, i) => ({
            serial: i === 0 ? (b.serialNumber ?? null) : null,
            unitId: i === 0 ? (b.unitId ?? null) : null,
          }));
  const camList = camSrc.length > 0 ? camSrc : [{ serial: b.serialNumber ?? null, unitId: b.unitId ?? null }];
  const cameraSlots = camList.map((c, i) => ({
    key: i === 0 ? 'camera' : `camera::${i}`,
    serial: c.serial ? normalizeCode(c.serial) : null,
    unitId: c.unitId ?? null,
  }));
  const scannableCameras = cameraSlots.filter((s) => s.serial).length;

  return {
    cameraSerial: cameraSlots[0]?.serial ?? null,
    cameraUnitId: cameraSlots[0]?.unitId ?? null,
    cameraSlots,
    codeToAccessory,
    codeToUnit,
    scannableCount: scannableCameras + codeToAccessory.size,
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

  const camHit = lookup.cameraSlots.find((s) => s.serial && s.serial === code);
  if (camHit) {
    if (checked[camHit.key]) {
      return { ok: false, alreadyChecked: true, message: `Kamera (${rawCode}) schon abgehakt.` };
    }
    return {
      ok: true,
      key: camHit.key,
      message: `✓ Kamera (${rawCode})`,
      scannedKind: 'camera',
      scannedUnitId: camHit.unitId ?? undefined,
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
      accessoryId: accId,
      scannedUnitId: localUnitId,
      includedParts: free.includedParts,
    };
  }

  let info: ServerScanLookup;
  try {
    const res = await fetch('/api/admin/scan-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, rawCode, bookingId }),
    });
    if (!res.ok) {
      if (res.status === 429) {
        return { ok: false, message: 'Zu viele Scans hintereinander — kurz warten und erneut scannen.' };
      }
      let detail = '';
      try {
        const b = await res.json();
        if (b && typeof b.error === 'string') detail = ` — ${b.error}`;
      } catch { /* kein JSON-Body */ }
      return { ok: false, message: `Scan-Server-Fehler (HTTP ${res.status}) bei „${rawCode}"${detail}.` };
    }
    info = await res.json();
  } catch {
    return { ok: false, message: `Netzwerkfehler beim Scan von „${rawCode}".` };
  }

  if (info.kind === 'unknown') {
    return { ok: false, message: `Code ${rawCode} ist im System nicht hinterlegt.` };
  }
  // Sammel-Zubehoer hat NUR EINEN QR fuer alle Stueck — derselbe Code wird
  // bewusst mehrfach gescannt (1 Scan pro physischem Stueck). Die unitId-
  // Dedup wuerde das ab dem 2. Stueck als Duplikat blocken. Fuer Bulk daher
  // ueberspringen; das qty-Limit haelt die Slot-Logik unten ein.
  const isBulkAccessory = info.kind === 'accessory' && info.isBulk === true;
  if (info.unitId && scannedUnitIds.has(info.unitId) && !isBulkAccessory) {
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
    // Clean-Match per Unit-ID: der gescannte Code loest (cross-world robust
    // ueber scan-lookup) auf GENAU die Kamera-Einheit auf, die dieser Buchung
    // zugewiesen ist. Der lokale camHit oben greift hier NICHT, weil der QR
    // eine andere Code-Repraesentation traegt (neue Welt: inventar_code; alte
    // Welt evtl. label) als die in cameraSlots[].serial aufgeloeste
    // Seriennummer — der String-Vergleich scheitert dann immer und es landete
    // faelschlich im Substitutions-Zweig ("Kamera ersetzt …"). Der Vergleich
    // ueber die kanonische unit_id ist die verlaessliche Quelle: stimmt sie
    // mit einem Buchungs-Slot ueberein, ist es KEINE Substitution.
    if (info.unitId) {
      const assignedSlot = lookup.cameraSlots.find(
        (s) => s.unitId && s.unitId === info.unitId,
      );
      if (assignedSlot) {
        if (checked[assignedSlot.key]) {
          return {
            ok: false,
            alreadyChecked: true,
            message: `Kamera (${info.serialNumber ?? rawCode}) schon abgehakt.`,
          };
        }
        return {
          ok: true,
          key: assignedSlot.key,
          message: `✓ Kamera (${info.serialNumber ?? rawCode})`,
          scannedKind: 'camera',
          scannedUnitId: info.unitId,
        };
      }
    }
    if (!allowSubstitution) {
      // Kontroll-/Retouren-Schritt: die unit_id des gescannten Codes stimmte
      // mit keinem Buchungs-Slot ueberein. Das ist KEIN Fehler, sondern der
      // haeufige Zwei-Welten-Fall: die Kamera lebt in der neuen inventar_units-
      // Welt und ihre unit_id-Repraesentation weicht von der in
      // bookings.cameras gespeicherten ab (bzw. die Buchung hatte gar keine
      // Einheit zugewiesen und der Pack-Schritt konnte den Swap nicht
      // persistieren). scan-lookup hat oben aber bereits ueber Produkt-ID ODER
      // Produktname bestaetigt, dass die Kamera zu DIESER Buchung gehoert
      // (info.matchesBooking === true — sonst waeren wir bei "wird nicht
      // benoetigt" oben raus). Also als sauberen Treffer auf den naechsten
      // freien Kamera-Slot werten, statt faelschlich zu blocken. Eine fremde
      // Kamera (anderes Modell / andere Buchung) wird weiterhin durch
      // matchesBooking=false abgefangen.
      const camSlots = items.filter((it) => it.type === 'camera');
      const freeCam = camSlots.find((it) => !checked[it.key]);
      if (!freeCam) {
        return { ok: false, alreadyChecked: true, message: `Alle Kameras schon abgehakt.` };
      }
      return {
        ok: true,
        key: freeCam.key,
        message: `✓ Kamera (${info.serialNumber ?? rawCode})`,
        scannedKind: 'camera',
        scannedUnitId: info.unitId,
      };
    }
    // Multi-Kamera-Buchung: NICHT hart auf Slot 'camera' setzen, sonst kann
    // die 2. (3. …) Kamera nie abgehakt werden (Slot 'camera::1' bleibt offen,
    // Counter haengt bei 1/N). Naechsten freien Kamera-Slot suchen.
    const camSlots = items.filter((it) => it.type === 'camera');
    const freeCam = camSlots.find((it) => !checked[it.key]);
    if (!freeCam) {
      return { ok: false, alreadyChecked: true, message: `Alle Kameras schon abgehakt.` };
    }
    // Hatte die Buchung ueberhaupt keine Kamera-Einheit zugewiesen (Legacy /
    // neue-Welt-Inventar ohne unit_id), ist das keine "Ersetzung" sondern die
    // Erst-Zuweisung — sonst wirkt jeder normale Scan faelschlich wie ein
    // Tausch ("wird immer nur ersetzt"). Substitution bleibt es nur, wenn ein
    // Slot eine andere Einheit hatte.
    const hadAnyAssignment = lookup.cameraSlots.some((s) => s.unitId);
    const camCode = info.serialNumber ?? rawCode;
    return {
      ok: true,
      key: freeCam.key,
      message: hadAnyAssignment
        ? `✓ Kamera ersetzt: ${camCode}`
        : `✓ Kamera erfasst: ${camCode}`,
      scannedKind: 'camera',
      scannedUnitId: info.unitId,
      isSubstitute: true,
      substituteCode: camCode,
    };
  }

  if (!info.matchesBooking) {
    return { ok: false, message: `Zubehör „${info.accessoryName ?? rawCode}" wird nicht benötigt.` };
  }
  // Sammel-Zubehoer: ein gemeinsamer QR steht fuer ALLE Stueck dieser
  // Position (es gibt keinen Code pro Einzelstueck). Ein Scan hakt deshalb
  // alle noch offenen Slots dieser Position ab. Das ist keine Substitution
  // (der Code ist der vorgesehene), greift daher auch im Kontroll-/Retouren-
  // Schritt (allowSubstitution=false).
  if (isBulkAccessory) {
    const bulkSlots = items.filter(
      (it) => it.type === 'accessory' && it.accessoryId === info.accessoryId,
    );
    const freeBulk = bulkSlots.filter((it) => !checked[it.key]);
    if (freeBulk.length === 0) {
      return { ok: false, alreadyChecked: true, message: `Alle „${info.accessoryName}" schon abgehakt.` };
    }
    const label = freeBulk[0].label;
    return {
      ok: true,
      key: freeBulk[0].key,
      keys: freeBulk.map((s) => s.key),
      message:
        freeBulk.length > 1
          ? `✓ ${label} — ${freeBulk.length} Stück erfasst (Sammel-QR)`
          : `✓ ${label}`,
      scannedKind: 'accessory',
      accessoryId: info.accessoryId,
      includedParts: freeBulk[0].includedParts,
    };
  }
  const slots = items.filter((it) => it.type === 'accessory' && it.accessoryId === info.accessoryId);
  const free = slots.find((it) => !checked[it.key]);
  if (!free) {
    return { ok: false, alreadyChecked: true, message: `Alle „${info.accessoryName}" schon abgehakt.` };
  }
  if (!allowSubstitution) {
    // Kontroll-/Retouren-Schritt: der gescannte Exemplar-Code stand nicht in
    // den lokal reservierten Codes (booking.unit_codes), deshalb sind wir hier
    // gelandet. Das ist KEIN Fehler, sondern der haeufige Zwei-Welten-Fall:
    // das Zubehoer-Stueck lebt in der neuen inventar_units-Welt (bzw. ist ein
    // Set-Bestandteil ohne zugewiesene Legacy-accessory_units-Einheit), seine
    // unit-id-Repraesentation steckt nicht in unit_codes. scan-lookup hat oben
    // aber bereits bestaetigt, dass das Zubehoer zu DIESER Buchung gehoert
    // (info.matchesBooking === true — sonst waeren wir bei "wird nicht
    // benoetigt" raus) und es gibt einen freien Slot dieser Position. Also als
    // sauberen Treffer werten statt faelschlich zu blocken. Fremdes Zubehoer
    // (anderer accessory_id / andere Buchung) wird weiter ueber
    // matchesBooking=false abgefangen.
    return {
      ok: true,
      key: free.key,
      message: `✓ ${free.label}`,
      scannedKind: 'accessory',
      accessoryId: info.accessoryId,
      scannedUnitId: info.unitId,
      includedParts: free.includedParts,
    };
  }
  return {
    ok: true,
    key: free.key,
    message: `✓ ${free.label} ersetzt: ${info.exemplarCode ?? rawCode}`,
    scannedKind: 'accessory',
    accessoryId: info.accessoryId,
    scannedUnitId: info.unitId,
    isSubstitute: true,
    substituteCode: info.exemplarCode ?? rawCode,
    includedParts: free.includedParts,
  };
}

/**
 * Wendet ein `ScanResult` race-safe auf den checked-State an. Aufruf
 * idiomatisch in `setChecked((prev) => applyScanResult(result, items, prev))`.
 *
 * Hintergrund: bei schnellen Folge-Scans im Continuous-Mode kann der vom
 * Server vorgeschlagene `key` zwischenzeitlich bereits abgehakt sein
 * (Scan-2 lief mit veraltetem `checked`-State). Dieser Helper erkennt das
 * und wählt stattdessen den nächsten freien Slot derselben Gruppe — der
 * Match passiert über den Key-Präfix vor `'::'` (z.B. `'extra-akku::0'` →
 * Gruppe `'extra-akku'`, `'camera::1'` → Gruppe `'camera'`). So braucht der
 * Fallback weder `accessoryId` noch `scannedKind` und funktioniert auch
 * dann, wenn der Server-Lookup unerwartete Werte zurückgibt.
 */
export function applyScanResult(
  result: ScanResult,
  items: PackItem[],
  prev: Record<string, boolean>,
): Record<string, boolean> {
  if (!result.ok) return prev;
  const next = { ...prev };
  if (result.keys && result.keys.length > 0) {
    for (const k of result.keys) next[k] = true;
    return next;
  }
  if (!result.key) return next;
  if (!next[result.key]) {
    next[result.key] = true;
    return next;
  }
  // Vorgeschlagener Slot wurde inzwischen abgehakt (Race bei schnellen
  // Folge-Scans) → nächsten freien Slot derselben Gruppe suchen. Match
  // über Key-Präfix vor '::' (für 'camera' ohne Suffix matcht 'camera' und
  // 'camera::N' gleichermaßen, weil split('::')[0] in beiden Fällen
  // 'camera' liefert).
  const prefix = result.key.split('::')[0];
  const free = items.find((it) => it.key.split('::')[0] === prefix && !next[it.key]);
  if (free) {
    next[free.key] = true;
  } else if (result.scannedKind === 'accessory' && result.accessoryId) {
    // Fallback-Fallback: falls Präfix-Match nichts findet, über accessoryId.
    const f2 = items.find(
      (it) => it.type === 'accessory' && it.accessoryId === result.accessoryId && !next[it.key],
    );
    if (f2) next[f2.key] = true;
  } else if (result.scannedKind === 'camera') {
    const f2 = items.find((it) => it.type === 'camera' && !next[it.key]);
    if (f2) next[f2.key] = true;
  }
  return next;
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
  groups, checked, onIncrement, onDecrement, compact, onManualPick,
}: {
  groups: GroupedItem[];
  checked: Record<string, boolean>;
  onIncrement: (g: GroupedItem) => void;
  onDecrement: (g: GroupedItem) => void;
  compact?: boolean;
  /** Wenn gesetzt, erscheint pro Zubehoer-Gruppe ein "Waehlen"-Button, der den
   *  manuellen Exemplar-Picker oeffnet (Fallback wenn Scannen nicht klappt).
   *  Ohne die Prop ist das UI 1:1 wie zuvor (keine Regression). */
  onManualPick?: (g: GroupedItem) => void;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  return (
    <>
      <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800">
        {groups.map((g) => {
          const checkedCount = groupCheckedCount(g, checked);
          const total = g.slotKeys.length;
          const fullyChecked = checkedCount === total;
          const partiallyChecked = checkedCount > 0 && !fullyChecked;
          const showCounter = total > 1;
          const hasParts = !!(g.includedParts && g.includedParts.length > 0);
          return (
            <div
              key={g.groupKey}
              className={`flex flex-col ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${
                fullyChecked ? 'bg-emerald-500/5' : partiallyChecked ? 'bg-amber-500/5' : ''
              }`}
            >
              <div className="flex items-start gap-3">
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
                {onManualPick && (g.type === 'accessory' || g.type === 'camera') && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onManualPick(g); }}
                    className="flex-shrink-0 px-2 py-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-xs font-semibold whitespace-nowrap"
                  >
                    📋 Wählen
                  </button>
                )}
              </div>
              {hasParts && (
                <div className={`mt-1.5 ${compact ? 'ml-9' : 'ml-9'} rounded-md border border-amber-500/30 bg-amber-500/10 ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}>
                  <div className={`font-semibold text-amber-300 ${compact ? 'text-[10px]' : 'text-[11px]'} uppercase tracking-wider mb-1`}>
                    Enthält {g.includedParts!.length} {g.includedParts!.length === 1 ? 'Teil' : 'Teile'}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {g.includedParts!.map((part, i) => {
                      const img = g.includedPartsImages?.[i] || '';
                      return (
                        <li key={i} className="flex items-center gap-2">
                          {img ? (
                            <button
                              type="button"
                              onClick={() => setLightboxUrl(img)}
                              aria-label={`${part} vergrößern`}
                              className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded overflow-hidden border border-amber-500/40 bg-slate-900 flex-shrink-0 hover:border-amber-300 transition-colors`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img} alt={part} className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <span className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded border border-dashed border-amber-500/30 flex-shrink-0 flex items-center justify-center text-amber-500/40 text-[10px]`}>
                              –
                            </span>
                          )}
                          <span className={`text-amber-200/90 leading-snug ${compact ? 'text-[11px]' : 'text-xs'}`}>
                            {part}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <PartImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </>
  );
}

function PartImageLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-100 flex items-center justify-center text-xl leading-none border border-slate-600"
        style={{ top: 'max(1rem, env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
      />
    </div>
  );
}

export type ScanFeedback = { type: 'ok' | 'warn' | 'err'; msg: string; parts?: string[] } | null;

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
          <div>{feedback.msg}</div>
          {feedback.parts && feedback.parts.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-current/20 text-xs">
              <span className="font-semibold">⚠ Enthält weitere Teile — bitte mitpacken:</span>
              <span className="ml-1 opacity-90">{feedback.parts.join(' · ')}</span>
            </div>
          )}
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
          <div>{feedback.msg}</div>
          {feedback.parts && feedback.parts.length > 0 && (
            <div className="mt-1 pt-1 border-t border-current/20">
              <span className="font-semibold">⚠ Enthält weitere Teile:</span>
              <span className="ml-1 opacity-90">{feedback.parts.join(' · ')}</span>
            </div>
          )}
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

// ─── Manueller Exemplar-Picker ───────────────────────────────────────────────
// Fallback wenn Scannen nicht klappt: zeigt pro Zubehoer-Position die echten
// physischen Exemplare (Exemplar-Codes) zur Auswahl. Datenquelle:
// GET /api/admin/booking/[id]/accessory-exemplars?accessory_id=X — liefert nur
// die Exemplare GENAU dieses Zubehoers (also nur die zur gebuchten Kamera
// passenden, z.B. nur GoPro-Akkus). Bereits gescannte/reservierte Exemplare
// werden vorausgewaehlt, damit Scan + Handauswahl dasselbe Ergebnis liefern.

export type ExemplarUnit = { id: string; exemplar_code: string; status: string; reserved: boolean };

export function ManualExemplarPicker({
  bookingId, group, currentScannedUnitIds, currentCheckedCount,
  onApplyUnits, onApplyQuantity, onClose, fetchUrl,
}: {
  bookingId: string;
  group: GroupedItem;
  currentScannedUnitIds: string[];
  currentCheckedCount: number;
  onApplyUnits: (allUnitIds: string[], selectedUnitIds: string[]) => void;
  onApplyQuantity: (n: number) => void;
  onClose: () => void;
  /**
   * Lese-Endpoint für die wählbaren Exemplare. Default = accessory-exemplars
   * (Zubehör). Für Kameras übergibt der Aufrufer die camera-exemplars-URL.
   * Muss `{ is_bulk, units: [{id, exemplar_code, status, reserved}] }` liefern.
   */
  fetchUrl?: string;
}) {
  const maxQty = group.slotKeys.length;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [units, setUnits] = useState<ExemplarUnit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(currentCheckedCount);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = fetchUrl
      ?? `/api/admin/booking/${bookingId}/accessory-exemplars?accessory_id=${encodeURIComponent(group.groupKey)}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.error) { setError(d.error); return; }
        const us: ExemplarUnit[] = Array.isArray(d.units) ? d.units : [];
        setIsBulk(!!d.is_bulk);
        setUnits(us);
        // Vorauswahl: bereits gescannte Exemplare dieser Position, sonst die
        // fuer diese Buchung reservierten (auf benoetigte Menge gedeckelt).
        const alreadyScanned = us.filter((u) => currentScannedUnitIds.includes(u.id)).map((u) => u.id);
        if (alreadyScanned.length > 0) {
          setSelected(new Set(alreadyScanned.slice(0, maxQty)));
        } else {
          setSelected(new Set(us.filter((u) => u.reserved).map((u) => u.id).slice(0, maxQty)));
        }
      })
      .catch(() => { if (!cancelled) setError('Konnte Exemplare nicht laden.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingId, group.groupKey, maxQty, currentScannedUnitIds, fetchUrl]);

  function toggle(unitId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        if (next.size >= maxQty) return prev; // Cap auf benoetigte Menge
        next.add(unitId);
      }
      return next;
    });
  }

  const useQuantityMode = !loading && !error && (isBulk || units.length === 0);

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-base font-bold text-slate-100">{group.label}</h3>
          <button type="button" onClick={onClose} aria-label="Schließen" className="text-slate-400 hover:text-slate-100 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Benötigt: {maxQty} Stück</p>

        {loading && <p className="text-sm text-slate-400">Lädt…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && !useQuantityMode && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Exemplare anhaken</span>
              <span className="text-xs font-mono text-cyan-300">{selected.size}/{maxQty}</span>
            </div>
            <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 mb-4">
              {units.map((u) => {
                const isSel = selected.has(u.id);
                const atCap = !isSel && selected.size >= maxQty;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u.id)}
                    disabled={atCap}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${atCap ? 'opacity-40' : 'hover:bg-slate-800/60'}`}
                  >
                    <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSel ? 'border-cyan-500 bg-cyan-500 text-slate-950' : 'border-slate-600'}`}>
                      {isSel && <span className="text-xs font-bold">✓</span>}
                    </span>
                    <span className="flex-1 min-w-0 font-mono text-sm text-slate-100 truncate">
                      {u.exemplar_code || u.id.slice(0, 8)}
                    </span>
                    <ExemplarStatusPill status={u.status} reserved={u.reserved} />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => onApplyUnits(units.map((u) => u.id), [...selected])}
              className="w-full bg-cyan-500 text-slate-950 font-bold py-2.5 rounded-lg"
            >
              Übernehmen ({selected.size})
            </button>
          </>
        )}

        {useQuantityMode && (
          <>
            <p className="text-sm text-slate-300 mb-3">
              {isBulk ? 'Sammel-Zubehör — keine Einzel-Exemplare.' : 'Keine einzeln erfassten Exemplare hinterlegt.'} Wie viele packst du ein?
            </p>
            <div className="flex items-center justify-center gap-4 mb-2">
              <button type="button" onClick={() => setQty((q) => Math.max(0, q - 1))} className="w-12 h-12 rounded-lg border border-slate-700 text-slate-200 text-2xl leading-none">−</button>
              <span className="text-2xl font-bold tabular-nums w-16 text-center">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="w-12 h-12 rounded-lg border border-slate-700 text-slate-200 text-2xl leading-none">+</button>
            </div>
            <p className="text-xs text-slate-500 text-center mb-4">von {maxQty} benötigt</p>
            <button
              type="button"
              onClick={() => onApplyQuantity(qty)}
              className="w-full bg-cyan-500 text-slate-950 font-bold py-2.5 rounded-lg"
            >
              Übernehmen ({qty})
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ExemplarStatusPill({ status, reserved }: { status: string; reserved: boolean }) {
  const label = reserved ? 'reserviert' : status === 'available' ? 'verfügbar' : status;
  const cls = reserved
    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
    : status === 'available'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : 'bg-slate-700/40 text-slate-300 border-slate-600';
  return <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

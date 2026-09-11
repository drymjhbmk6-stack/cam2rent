import { describe, it, expect } from 'vitest';
import {
  sanitizeOpenItems,
  totalReplacementValue,
  splitAccessoryUnitIds,
  isMissingOpenItemsTable,
  isMissingPartKind,
  type OpenItemInput,
} from '../return-open-items';

const base = {
  kind: 'accessory',
  accessoryId: 'akku',
  label: 'Ersatz-Akku',
  qty: 1,
  resolution: 'follow_up',
  dueDate: '2026-09-10',
};

describe('sanitizeOpenItems', () => {
  it('nimmt eine gültige Position unverändert an', () => {
    const out = sanitizeOpenItems([base]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'accessory', accessoryId: 'akku', label: 'Ersatz-Akku',
      qty: 1, resolution: 'follow_up', dueDate: '2026-09-10',
    });
  });

  it('gibt bei Nicht-Arrays eine leere Liste zurück', () => {
    expect(sanitizeOpenItems(null)).toEqual([]);
    expect(sanitizeOpenItems(undefined)).toEqual([]);
    expect(sanitizeOpenItems('kaputt')).toEqual([]);
    expect(sanitizeOpenItems({ qty: 3 })).toEqual([]);
  });

  it('verwirft Positionen ohne Label oder mit unbekannter Auflösung', () => {
    expect(sanitizeOpenItems([{ ...base, label: '   ' }])).toEqual([]);
    expect(sanitizeOpenItems([{ ...base, resolution: 'geschenkt' }])).toEqual([]);
  });

  it('deckelt die Menge gegen den echten Buchungsbestand', () => {
    const caps = new Map([['accessory:akku', 2]]);
    // Client meldet 99 fehlende Akkus, die Buchung enthielt aber nur 2.
    const out = sanitizeOpenItems([{ ...base, qty: 99 }], caps);
    expect(out[0].qty).toBe(2);
  });

  it('verwirft die Position, wenn der Cap 0 ist (gar nicht gebucht)', () => {
    const caps = new Map([['accessory:fremd', 0]]);
    expect(sanitizeOpenItems([{ ...base, accessoryId: 'fremd', qty: 5 }], caps)).toEqual([]);
  });

  it('hebt ungültige Mengen auf mindestens 1 an', () => {
    expect(sanitizeOpenItems([{ ...base, qty: 0 }])[0].qty).toBe(1);
    expect(sanitizeOpenItems([{ ...base, qty: -7 }])[0].qty).toBe(1);
    expect(sanitizeOpenItems([{ ...base, qty: 'viele' }])[0].qty).toBe(1);
  });

  it('deckelt auf maximal 50 Positionen', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ ...base, label: `Teil ${i}` }));
    expect(sanitizeOpenItems(many)).toHaveLength(50);
  });

  it('klemmt negative Ersatzbeträge auf 0 und rundet auf Cent', () => {
    const replace = { ...base, resolution: 'replace' };
    expect(sanitizeOpenItems([{ ...replace, unitValue: -50 }])[0].unitValue).toBe(0);
    expect(sanitizeOpenItems([{ ...replace, unitValue: 19.999 }])[0].unitValue).toBe(20);
    expect(sanitizeOpenItems([{ ...replace, unitValue: 'zehn' }])[0].unitValue).toBe(0);
  });

  it('trägt Betrag nur bei replace und Frist nur bei follow_up', () => {
    const [replace] = sanitizeOpenItems([{ ...base, resolution: 'replace', unitValue: 12, dueDate: '2026-09-10' }]);
    expect(replace.unitValue).toBe(12);
    expect(replace.dueDate).toBeNull();

    const [followUp] = sanitizeOpenItems([{ ...base, unitValue: 12 }]);
    expect(followUp.unitValue).toBeNull();
    expect(followUp.dueDate).toBe('2026-09-10');
  });

  it('akzeptiert nur echtes YYYY-MM-DD als Frist', () => {
    expect(sanitizeOpenItems([{ ...base, dueDate: '10.09.2026' }])[0].dueDate).toBeNull();
    expect(sanitizeOpenItems([{ ...base, dueDate: '2026-13-45' }])[0].dueDate).toBeNull();
    expect(sanitizeOpenItems([{ ...base, dueDate: '' }])[0].dueDate).toBeNull();
    expect(sanitizeOpenItems([{ ...base, dueDate: '2026-09-10T12:00:00Z' }])[0].dueDate).toBe('2026-09-10');
  });

  it('setzt bei Kameras product_id statt accessory_id und deckelt über den Namen', () => {
    const caps = new Map([['camera:gopro hero13 black', 1]]);
    const out = sanitizeOpenItems([{
      kind: 'camera', productId: 'gopro-13', label: 'GoPro Hero13 Black',
      qty: 4, resolution: 'replace', unitValue: 300,
    }], caps);
    expect(out[0]).toMatchObject({ kind: 'camera', productId: 'gopro-13', accessoryId: null, qty: 1 });
  });

  it('kürzt überlange Labels', () => {
    expect(sanitizeOpenItems([{ ...base, label: 'x'.repeat(500) }])[0].label).toHaveLength(200);
  });
});

describe('sanitizeOpenItems — fehlende Bestandteile (kind: part)', () => {
  const part = {
    kind: 'part',
    accessoryId: 'lenkerhalterung',
    label: 'Lenkerhalterung — orangener Rund-Adapter',
    qty: 1,
    resolution: 'follow_up',
    dueDate: '2026-09-25',
  };

  it('nimmt ein Bestandteil an, wenn das Eltern-Zubehör gebucht ist', () => {
    const caps = new Map([['accessory:lenkerhalterung', 1]]);
    const out = sanitizeOpenItems([part], caps);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'part',
      accessoryId: 'lenkerhalterung',
      label: 'Lenkerhalterung — orangener Rund-Adapter',
      qty: 1,
      resolution: 'follow_up',
    });
  });

  it('verwirft ein Bestandteil ohne Eltern-Zubehör', () => {
    expect(sanitizeOpenItems([{ ...part, accessoryId: '' }], new Map())).toEqual([]);
  });

  it('verwirft ein Bestandteil, dessen Eltern-Zubehör gar nicht gebucht wurde', () => {
    const caps = new Map([['accessory:akku', 1]]);
    expect(sanitizeOpenItems([part], caps)).toEqual([]);
  });

  it('deckelt das Bestandteil NICHT gegen die Buchungsmenge des Zubehörs', () => {
    // Die Halterung ist 1× gebucht, kann aber zwei Adapter enthalten.
    const caps = new Map([['accessory:lenkerhalterung', 1]]);
    const out = sanitizeOpenItems([{ ...part, qty: 2 }], caps);
    expect(out[0].qty).toBe(2);
  });

  it('deckelt die Menge eines Bestandteils auf 99', () => {
    const caps = new Map([['accessory:lenkerhalterung', 1]]);
    const out = sanitizeOpenItems([{ ...part, qty: 5000 }], caps);
    expect(out[0].qty).toBe(99);
  });

  it('setzt bei einem Bestandteil keine product_id', () => {
    const caps = new Map([['accessory:lenkerhalterung', 1]]);
    const out = sanitizeOpenItems([{ ...part, productId: 'gopro-13' }], caps);
    expect(out[0].productId).toBeNull();
  });

  it('trägt auch beim Bestandteil den Ersatzbetrag nur bei replace', () => {
    const caps = new Map([['accessory:lenkerhalterung', 1]]);
    const out = sanitizeOpenItems(
      [{ ...part, resolution: 'replace', unitValue: 4.5, dueDate: '2026-09-25' }],
      caps,
    );
    expect(out[0]).toMatchObject({ unitValue: 4.5, dueDate: null });
  });
});

describe('splitAccessoryUnitIds — Bestandteile', () => {
  it('gibt einem Bestandteil kein Exemplar (das Zubehör ist ja zurück)', () => {
    const items = [
      { kind: 'part', accessoryId: 'halterung', label: 'Adapter', qty: 1, resolution: 'follow_up' },
    ] as OpenItemInput[];
    const { perItem, releasable } = splitAccessoryUnitIds(
      items,
      ['u1', 'u2'],
      new Map([['u1', 'halterung'], ['u2', 'halterung']]),
    );
    expect(perItem[0]).toEqual([]);
    // Beide Exemplare bleiben freigebbar — die Halterung ist wieder vermietbar.
    expect(releasable).toEqual(['u1', 'u2']);
  });
});

describe('isMissingPartKind', () => {
  it('erkennt den CHECK-Verstoß einer Migration ohne kind=part', () => {
    expect(isMissingPartKind({
      code: '23514',
      message: 'new row violates check constraint "booking_return_open_items_kind_check"',
    })).toBe(true);
  });

  it('schluckt keine fremden CHECK-Verstöße', () => {
    expect(isMissingPartKind({ code: '23514', message: 'qty check violated' })).toBe(false);
    expect(isMissingPartKind({ code: '23505', message: 'kind duplicate' })).toBe(false);
    expect(isMissingPartKind(null)).toBe(false);
  });
});

describe('totalReplacementValue', () => {
  it('summiert nur die replace-Positionen inklusive Menge', () => {
    const items = sanitizeOpenItems([
      { ...base, resolution: 'replace', unitValue: 10, qty: 3 },
      { ...base, accessoryId: 'stativ', label: 'Stativ', resolution: 'replace', unitValue: 25.5 },
      { ...base, accessoryId: 'gurt', label: 'Gurt' }, // follow_up → zählt nicht
    ]);
    expect(totalReplacementValue(items)).toBe(55.5);
  });

  it('liefert 0 ohne replace-Positionen', () => {
    expect(totalReplacementValue(sanitizeOpenItems([base]))).toBe(0);
  });
});

describe('splitAccessoryUnitIds', () => {
  const unitToAccessory = new Map([
    ['u1', 'akku'], ['u2', 'akku'], ['u3', 'stativ'],
  ]);

  it('beansprucht pro Position bis zu qty Exemplare, der Rest bleibt freigebbar', () => {
    const items: OpenItemInput[] = sanitizeOpenItems([{ ...base, qty: 1 }]);
    const { perItem, releasable } = splitAccessoryUnitIds(items, ['u1', 'u2', 'u3'], unitToAccessory);
    expect(perItem[0]).toEqual(['u1']);
    expect(releasable).toEqual(['u2', 'u3']);
  });

  it('vergibt kein Exemplar doppelt an zwei Positionen', () => {
    const items = sanitizeOpenItems([
      { ...base, qty: 1 },
      { ...base, label: 'Ersatz-Akku (2)', qty: 1 },
    ]);
    const { perItem, releasable } = splitAccessoryUnitIds(items, ['u1', 'u2', 'u3'], unitToAccessory);
    expect(perItem[0]).toEqual(['u1']);
    expect(perItem[1]).toEqual(['u2']);
    expect(releasable).toEqual(['u3']);
  });

  it('gibt Kamera-Positionen keine Zubehör-Exemplare', () => {
    const items = sanitizeOpenItems([{
      kind: 'camera', productId: 'p1', label: 'GoPro', qty: 1, resolution: 'replace', unitValue: 300,
    }]);
    const { perItem, releasable } = splitAccessoryUnitIds(items, ['u1'], unitToAccessory);
    expect(perItem[0]).toEqual([]);
    expect(releasable).toEqual(['u1']);
  });

  it('bleibt stabil, wenn gar keine Exemplare hinterlegt sind', () => {
    const items = sanitizeOpenItems([base]);
    expect(splitAccessoryUnitIds(items, [], unitToAccessory)).toEqual({ perItem: [[]], releasable: [] });
  });
});

describe('isMissingOpenItemsTable', () => {
  it('erkennt die fehlende Tabelle über beide Fehlercodes', () => {
    expect(isMissingOpenItemsTable({ code: '42P01' })).toBe(true);
    expect(isMissingOpenItemsTable({ code: 'PGRST205' })).toBe(true);
  });

  it('erkennt sie auch nur über die Meldung', () => {
    expect(isMissingOpenItemsTable({
      message: "Could not find the table 'public.booking_return_open_items' in the schema cache",
    })).toBe(true);
  });

  it('schluckt keine fremden Fehler', () => {
    expect(isMissingOpenItemsTable(null)).toBe(false);
    expect(isMissingOpenItemsTable({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingOpenItemsTable({ message: 'relation "bookings" does not exist' })).toBe(false);
  });
});

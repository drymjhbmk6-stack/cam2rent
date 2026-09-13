import { describe, it, expect } from 'vitest';
import {
  buildPhotoSlots,
  parseStoredPhotos,
  storedPhotoFromSlot,
  overviewPhotoPath,
  missingPhotoTitles,
  photoFieldName,
  extraPhotoFieldName,
  MAX_PHOTO_CAMERAS,
  OVERVIEW_SLOT_KEY,
  type StoredPhoto,
} from '../photo-slots';

describe('buildPhotoSlots', () => {
  it('erzeugt 1 + 2xN Pflicht-Fotos', () => {
    expect(buildPhotoSlots([{ product_name: 'GoPro Hero13' }])).toHaveLength(3);
    expect(buildPhotoSlots([{ product_name: 'A' }, { product_name: 'B' }])).toHaveLength(5);
    expect(
      buildPhotoSlots([{ product_name: 'A' }, { product_name: 'B' }, { product_name: 'C' }]),
    ).toHaveLength(7);
  });

  it('ohne Kamera bleibt nur das Gesamtfoto (Datenlücke blockiert nicht)', () => {
    for (const input of [[], null, undefined]) {
      const slots = buildPhotoSlots(input as never);
      expect(slots).toHaveLength(1);
      expect(slots[0].key).toBe(OVERVIEW_SLOT_KEY);
      expect(slots[0].kind).toBe('overview');
    }
  });

  it('erste Position ist immer das Gesamtfoto', () => {
    const slots = buildPhotoSlots([{ product_name: 'X' }]);
    expect(slots[0].kind).toBe('overview');
    expect(slots[0].cameraIndex).toBeNull();
  });

  it('vergibt pro Kamera Vorder- und Rückseite mit eindeutigen Schlüsseln', () => {
    const slots = buildPhotoSlots([{ product_name: 'A' }, { product_name: 'B' }]);
    expect(slots.map((s) => s.key)).toEqual([
      'overview',
      'cam0_front',
      'cam0_back',
      'cam1_front',
      'cam1_back',
    ]);
    expect(new Set(slots.map((s) => s.key)).size).toBe(slots.length);
    expect(slots[1].kind).toBe('camera_front');
    expect(slots[2].kind).toBe('camera_back');
    expect(slots[1].cameraIndex).toBe(0);
    expect(slots[4].cameraIndex).toBe(1);
  });

  it('nummeriert Titel nur bei mehreren Kameras', () => {
    const single = buildPhotoSlots([{ product_name: 'Osmo' }]);
    expect(single[1].title).toBe('Osmo — Vorderseite');
    const multi = buildPhotoSlots([{ product_name: 'Osmo' }, { product_name: 'Osmo' }]);
    expect(multi[1].title).toBe('Osmo (1/2) — Vorderseite');
    expect(multi[3].title).toBe('Osmo (2/2) — Vorderseite');
  });

  it('fällt bei leerem Namen auf "Kamera N" zurück', () => {
    const slots = buildPhotoSlots([{ product_name: '   ' }]);
    expect(slots[1].cameraLabel).toBe('Kamera 1');
  });

  it('übernimmt Seriennummer und unit_id getrimmt, sonst null', () => {
    const slots = buildPhotoSlots([{ product_name: 'A', serial_number: ' SN1 ', unit_id: ' u1 ' }]);
    expect(slots[1].serial).toBe('SN1');
    expect(slots[1].unitId).toBe('u1');
    const empty = buildPhotoSlots([{ product_name: 'A', serial_number: '', unit_id: '' }]);
    expect(empty[1].serial).toBeNull();
    expect(empty[1].unitId).toBeNull();
  });

  it('deckelt die Kamera-Anzahl', () => {
    const many = Array.from({ length: MAX_PHOTO_CAMERAS + 5 }, (_, i) => ({ product_name: `C${i}` }));
    expect(buildPhotoSlots(many)).toHaveLength(1 + 2 * MAX_PHOTO_CAMERAS);
  });
});

describe('Feldnamen', () => {
  it('sind stabil und kollisionsfrei', () => {
    expect(photoFieldName('overview')).toBe('photo_overview');
    expect(photoFieldName('cam0_front')).toBe('photo_cam0_front');
    expect(extraPhotoFieldName(0)).toBe('photo_extra_0');
    expect(extraPhotoFieldName(3)).not.toBe(photoFieldName('extra_3_x'));
  });
});

describe('storedPhotoFromSlot', () => {
  it('speichert Kamera-Bezug nur wenn vorhanden', () => {
    const [overview, front] = buildPhotoSlots([{ product_name: 'A', unit_id: 'u1' }]);
    expect(storedPhotoFromSlot(overview, 'p/1.jpg')).toEqual({
      path: 'p/1.jpg',
      kind: 'overview',
      title: 'Gesamtfoto',
    });
    expect(storedPhotoFromSlot(front, 'p/2.jpg')).toEqual({
      path: 'p/2.jpg',
      kind: 'camera_front',
      title: 'A — Vorderseite',
      cameraIndex: 0,
      cameraLabel: 'A',
      unitId: 'u1',
    });
  });

  it('cameraIndex 0 geht nicht verloren (Falsy-Falle)', () => {
    const front = buildPhotoSlots([{ product_name: 'A' }])[1];
    expect(storedPhotoFromSlot(front, 'x.jpg').cameraIndex).toBe(0);
  });
});

describe('parseStoredPhotos', () => {
  it('liest Array und JSON-String', () => {
    const raw = [{ path: 'a.jpg', kind: 'overview', title: 'Gesamtfoto' }];
    expect(parseStoredPhotos(raw)).toHaveLength(1);
    expect(parseStoredPhotos(JSON.stringify(raw))).toHaveLength(1);
  });

  it('ist defensiv gegen Müll', () => {
    expect(parseStoredPhotos(null)).toEqual([]);
    expect(parseStoredPhotos(undefined)).toEqual([]);
    expect(parseStoredPhotos('kein json')).toEqual([]);
    expect(parseStoredPhotos({ path: 'a' })).toEqual([]);
    expect(parseStoredPhotos([null, 42, 'x', {}, { path: '  ' }])).toEqual([]);
  });

  it('normalisiert unbekannte kind-Werte auf extra und setzt Titel-Fallback', () => {
    const [p] = parseStoredPhotos([{ path: 'a.jpg', kind: 'quatsch' }]);
    expect(p.kind).toBe('extra');
    expect(p.title).toBe('Foto');
  });

  it('verwirft negative/gebrochene cameraIndex-Werte', () => {
    expect(parseStoredPhotos([{ path: 'a.jpg', cameraIndex: -1 }])[0].cameraIndex).toBeUndefined();
    expect(parseStoredPhotos([{ path: 'a.jpg', cameraIndex: 1.5 }])[0].cameraIndex).toBeUndefined();
    expect(parseStoredPhotos([{ path: 'a.jpg', cameraIndex: 2 }])[0].cameraIndex).toBe(2);
  });
});

describe('overviewPhotoPath', () => {
  it('bevorzugt das Gesamtfoto', () => {
    const photos: StoredPhoto[] = [
      { path: 'front.jpg', kind: 'camera_front', title: 'x' },
      { path: 'ueber.jpg', kind: 'overview', title: 'Gesamtfoto' },
    ];
    expect(overviewPhotoPath(photos)).toBe('ueber.jpg');
  });

  it('fällt ohne Gesamtfoto auf das erste Foto zurück, sonst null', () => {
    expect(overviewPhotoPath([{ path: 'a.jpg', kind: 'extra', title: 'x' }])).toBe('a.jpg');
    expect(overviewPhotoPath([])).toBeNull();
  });
});

describe('missingPhotoTitles', () => {
  it('listet genau die fehlenden Positionen', () => {
    const slots = buildPhotoSlots([{ product_name: 'A' }]);
    const have = new Set(['overview', 'cam0_front']);
    expect(missingPhotoTitles(slots, (k) => have.has(k))).toEqual(['A — Rückseite']);
    expect(missingPhotoTitles(slots, () => true)).toEqual([]);
    expect(missingPhotoTitles(slots, () => false)).toHaveLength(3);
  });
});

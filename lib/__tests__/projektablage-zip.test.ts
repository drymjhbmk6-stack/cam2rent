/**
 * Prueft, dass der Streaming-ZIP-Aufbau ein gueltiges Archiv erzeugt:
 * richtige Ordnerstruktur, unveraenderte Inhalte, auch bei Dateien, die
 * groesser als ein einzelner Netzwerk-Chunk sind.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import { unzipSync, strFromU8 } from 'fflate';
import { createZipStream, safeZipFilename } from '../projektablage-zip';

const dateien: Record<string, Buffer> = {
  'klein.txt': Buffer.from('Hallo Welt — mit Umlauten äöü', 'utf8'),
  'gross.bin': Buffer.alloc(3 * 1024 * 1024, 7), // ueber viele Chunks verteilt
  'code.php': Buffer.from('<?php echo "test"; ?>\n', 'utf8'),
};

let server: Server;
let basis = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? '').replace(/^\//, ''));
    const body = dateien[key];
    if (!body) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  basis = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function sammle(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const teile: Uint8Array[] = [];
  let laenge = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      teile.push(value);
      laenge += value.length;
    }
  }
  const out = new Uint8Array(laenge);
  let offset = 0;
  for (const teil of teile) {
    out.set(teil, offset);
    offset += teil.length;
  }
  return out;
}

describe('createZipStream', () => {
  it('erzeugt ein entpackbares Archiv mit erhaltener Ordnerstruktur', async () => {
    const zipBytes = await sammle(
      createZipStream([
        { relPfad: 'src/lib/code.php', url: `${basis}/code.php` },
        { relPfad: 'doku/klein.txt', url: `${basis}/klein.txt` },
        { relPfad: 'assets/gross.bin', url: `${basis}/gross.bin` },
      ])
    );

    // Gueltiger ZIP-Header
    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);

    const entpackt = unzipSync(zipBytes);
    expect(Object.keys(entpackt).sort()).toEqual([
      'assets/gross.bin',
      'doku/klein.txt',
      'src/lib/code.php',
    ]);

    expect(strFromU8(entpackt['doku/klein.txt'])).toBe(dateien['klein.txt'].toString('utf8'));
    expect(strFromU8(entpackt['src/lib/code.php'])).toBe(dateien['code.php'].toString('utf8'));
    expect(entpackt['assets/gross.bin'].length).toBe(3 * 1024 * 1024);
    expect(entpackt['assets/gross.bin'][0]).toBe(7);
    expect(entpackt['assets/gross.bin'][3 * 1024 * 1024 - 1]).toBe(7);
  }, 60_000);

  it('ueberspringt nicht ladbare Dateien und legt einen Hinweis ins Archiv', async () => {
    const zipBytes = await sammle(
      createZipStream([
        { relPfad: 'ok.txt', url: `${basis}/klein.txt` },
        { relPfad: 'weg/verloren.txt', url: `${basis}/gibtsnicht.txt` },
      ])
    );

    const entpackt = unzipSync(zipBytes);
    expect(Object.keys(entpackt).sort()).toEqual(['_FEHLENDE-DATEIEN.txt', 'ok.txt']);
    expect(strFromU8(entpackt['_FEHLENDE-DATEIEN.txt'])).toContain('weg/verloren.txt');
  }, 30_000);

  it('speichert bereits komprimierte Dateien ohne erneutes Komprimieren', async () => {
    const zipBytes = await sammle(
      createZipStream([{ relPfad: 'bild.png', url: `${basis}/gross.bin` }])
    );
    const entpackt = unzipSync(zipBytes);
    expect(entpackt['bild.png'].length).toBe(3 * 1024 * 1024);
  }, 30_000);
});

describe('safeZipFilename', () => {
  it('entfernt Zeichen, die den Content-Disposition-Header sprengen', () => {
    // " / \r \n und / werden je zu '-', danach kollabieren Leerzeichen
    expect(safeZipFilename('mein"projekt\r\n/../x')).toBe('mein-projekt---..-x');
    expect(safeZipFilename('   ')).toBe('projektstand');
    expect(safeZipFilename('Normales Projekt-v3')).toBe('Normales Projekt-v3');
  });
});

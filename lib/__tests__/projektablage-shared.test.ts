/**
 * Der Pfad-Sanitizer ist die Stelle, an der ein praeparierter Dateiname beim
 * Entpacken auf dem Rechner des Nutzers ausbrechen koennte ("Zip Slip").
 * Entsprechend eng sind die Tests.
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeRelPath,
  shouldIgnorePath,
  baseName,
  fmtBytes,
  MAX_PATH_DEPTH,
  isZipFileName,
} from '../projektablage-shared';

describe('sanitizeRelPath', () => {
  it('laesst normale Pfade unveraendert', () => {
    expect(sanitizeRelPath('src/lib/foo.php')).toBe('src/lib/foo.php');
    expect(sanitizeRelPath('index.py')).toBe('index.py');
    expect(sanitizeRelPath('Ordner mit Leerzeichen/Datei äöü.txt')).toBe(
      'Ordner mit Leerzeichen/Datei äöü.txt'
    );
  });

  it('entfernt Ausbruchsversuche', () => {
    expect(sanitizeRelPath('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeRelPath('/etc/passwd')).toBe('etc/passwd');
    expect(sanitizeRelPath('a/../../../b.txt')).toBe('a/b.txt');
    expect(sanitizeRelPath('./x/./y.txt')).toBe('x/y.txt');
    expect(sanitizeRelPath('..')).toBeNull();
    expect(sanitizeRelPath('../..')).toBeNull();
  });

  it('normalisiert Windows-Pfade', () => {
    expect(sanitizeRelPath('src\\lib\\foo.php')).toBe('src/lib/foo.php');
    expect(sanitizeRelPath('C:\\Projekt\\main.py')).toBe('Projekt/main.py');
  });

  it('entfernt Steuerzeichen und NUL', () => {
    expect(sanitizeRelPath('a\u0000b.txt')).toBe('ab.txt');
    expect(sanitizeRelPath('datei\r\n.txt')).toBe('datei.txt');
  });

  it('raeumt doppelte und leere Segmente auf', () => {
    expect(sanitizeRelPath('a//b///c.txt')).toBe('a/b/c.txt');
    expect(sanitizeRelPath('  a  /  b.txt  ')).toBe('a/b.txt');
  });

  it('weist Unbrauchbares zurueck', () => {
    expect(sanitizeRelPath('')).toBeNull();
    expect(sanitizeRelPath('///')).toBeNull();
    expect(sanitizeRelPath(null)).toBeNull();
    expect(sanitizeRelPath(42)).toBeNull();
    expect(sanitizeRelPath(undefined)).toBeNull();
  });

  it('begrenzt Tiefe und Laenge', () => {
    const zuTief = Array(MAX_PATH_DEPTH + 1).fill('x').join('/') + '/d.txt';
    expect(sanitizeRelPath(zuTief)).toBeNull();

    const gradeNoch = Array(MAX_PATH_DEPTH).fill('x').join('/');
    expect(sanitizeRelPath(gradeNoch)).not.toBeNull();

    expect(sanitizeRelPath('a'.repeat(401))).toBeNull();
  });
});

describe('shouldIgnorePath', () => {
  it('filtert Abhaengigkeits- und Build-Ordner', () => {
    expect(shouldIgnorePath('node_modules/react/index.js')).toBe(true);
    expect(shouldIgnorePath('app/node_modules/x/y.js')).toBe(true);
    expect(shouldIgnorePath('.git/config')).toBe(true);
    expect(shouldIgnorePath('backend/__pycache__/mod.pyc')).toBe(true);
    expect(shouldIgnorePath('dist/bundle.js')).toBe(true);
    expect(shouldIgnorePath('vendor/autoload.php')).toBe(true);
  });

  it('filtert Systemdateien und Log-Muell', () => {
    expect(shouldIgnorePath('.DS_Store')).toBe(true);
    expect(shouldIgnorePath('logs/server.log')).toBe(true);
    expect(shouldIgnorePath('a/b/Thumbs.db')).toBe(true);
  });

  it('laesst echten Quellcode durch', () => {
    expect(shouldIgnorePath('src/index.php')).toBe(false);
    expect(shouldIgnorePath('app/main.py')).toBe(false);
    expect(shouldIgnorePath('README.md')).toBe(false);
    // 'dist' nur als Ordner, nicht als Namensbestandteil
    expect(shouldIgnorePath('src/distanz.ts')).toBe(false);
    // Dateiname 'build' ohne Ordner-Charakter bleibt erhalten
    expect(shouldIgnorePath('build')).toBe(false);
  });
});

describe('baseName / fmtBytes', () => {
  it('liefert den Dateinamen', () => {
    expect(baseName('a/b/c.txt')).toBe('c.txt');
    expect(baseName('c.txt')).toBe('c.txt');
  });

  it('formatiert Groessen deutsch', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1536)).toBe('1,5 KB');
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5,0 MB');
    expect(fmtBytes(-1)).toBe('—');
  });
});

describe('isZipFileName', () => {
  it('erkennt .zip unabhaengig von Gross-/Kleinschreibung', () => {
    expect(isZipFileName('projekt.zip')).toBe(true);
    expect(isZipFileName('Projekt.ZIP')).toBe(true);
    expect(isZipFileName('a/b/c.Zip')).toBe(true);
  });

  it('lehnt andere Dateien ab', () => {
    expect(isZipFileName('projekt.zip.txt')).toBe(false);
    expect(isZipFileName('archiv.tar.gz')).toBe(false);
    expect(isZipFileName('zip')).toBe(false);
    expect(isZipFileName('')).toBe(false);
  });
});

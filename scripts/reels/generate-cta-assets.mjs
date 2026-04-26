#!/usr/bin/env node
/**
 * Generiert die Pre-rendered Brand-Assets fuer die Reels-CTA-Frames (Phase 2.3).
 *
 * Ausgabe (relativ zum Repo-Root):
 *   assets/reels/cta-gradient.png — 1080x1920 linearer Gradient (Navy → Blue)
 *   assets/reels/cta-url-pill.png  — 720x140 weisses Pill mit 28px Border-Radius
 *
 * Warum als PNG und nicht im FFmpeg generieren?
 *   - geq-Filter fuer Gradients ist langsam (~4 s/Frame in Full-HD) und schwer
 *     zu debuggen. Ein einmal gerenderter Gradient ist 30 KB klein und vom
 *     FFmpeg-overlay-Filter zero-cost.
 *   - drawbox kann keine Border-Radius. Pre-rendered Pill-PNG mit alpha
 *     loest das ohne Extra-Filter.
 *
 * Skript ist deterministisch + idempotent — bei jedem Lauf entstehen
 * byte-identische PNGs. Wird einmalig ausgefuehrt (oder bei Brand-Aenderung).
 *
 * Aufruf:
 *   node scripts/reels/generate-cta-assets.mjs
 */

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'assets', 'reels');

// cam2rent-Brandfarben (siehe CLAUDE.md "Marken-Logos v4")
const NAVY = { r: 0x0f, g: 0x17, b: 0x2a }; // #0F172A
const BLUE = { r: 0x1e, g: 0x40, b: 0xaf }; // #1E40AF

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** 1080x1920 linearer Gradient, vertikal Navy → Blue. */
async function buildGradient() {
  const W = 1080;
  const H = 1920;
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const r = lerp(NAVY.r, BLUE.r, t);
    const g = lerp(NAVY.g, BLUE.g, t);
    const b = lerp(NAVY.b, BLUE.b, t);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }
  const png = await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return png;
}

/**
 * 720x140 weisses Pill mit 28px Border-Radius, leichtem Drop-Shadow.
 * Transparenter Hintergrund drumherum, damit es per overlay sauber sitzt.
 */
async function buildUrlPill() {
  const W = 720;
  const H = 140;
  const RADIUS = 28;
  const SHADOW_BLUR = 12;
  const SHADOW_OFFSET = 4;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${SHADOW_BLUR / 2}" />
      <feOffset dx="0" dy="${SHADOW_OFFSET}" result="offsetblur" />
      <feFlood flood-color="#000000" flood-opacity="0.18" />
      <feComposite in2="offsetblur" operator="in" />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect
    x="${SHADOW_BLUR}"
    y="${SHADOW_BLUR / 2}"
    width="${W - SHADOW_BLUR * 2}"
    height="${H - SHADOW_BLUR}"
    rx="${RADIUS}"
    ry="${RADIUS}"
    fill="#FFFFFF"
    filter="url(#shadow)"
  />
</svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return png;
}

async function main() {
  const gradient = await buildGradient();
  const pill = await buildUrlPill();
  const gradientPath = path.join(OUT_DIR, 'cta-gradient.png');
  const pillPath = path.join(OUT_DIR, 'cta-url-pill.png');
  await writeFile(gradientPath, gradient);
  await writeFile(pillPath, pill);
  console.log(`[ok] ${path.relative(REPO_ROOT, gradientPath)} (${gradient.length} bytes)`);
  console.log(`[ok] ${path.relative(REPO_ROOT, pillPath)} (${pill.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

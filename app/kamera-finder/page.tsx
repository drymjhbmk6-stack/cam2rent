'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { products, type Product } from '@/data/products';

/* ───────────────────────── Types ─────────────────────────────────────────── */

interface QuestionOption {
  label: string;
  icon: React.ReactNode;
  value: string;
}

interface Question {
  title: string;
  options: QuestionOption[];
}

interface Answers {
  usage: string;
  waterproof: string;
  quality: string;
  duration: string;
  budget: string;
}

/* ───────────────────────── Icons (inline SVGs) ───────────────────────────── */

function IconSport() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
function IconTravel() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}
function IconUnderwater() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m-7.071-2.929l.707-.707m12.728 0l.707.707M3 12h1m16 0h1M6.343 6.343l.707.707m10.607 10.607l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.636 18.364C3 15.727 3 12 3 12s0-3.727 2.636-6.364M18.364 5.636C21 8.273 21 12 21 12s0 3.727-2.636 6.364" />
    </svg>
  );
}
function IconTimelapse() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}
function IconEvent() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
    </svg>
  );
}
function IconOther() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  );
}
function IconWaterYes() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a8 8 0 008-8c0-4.418-8-12-8-12S4 8.582 4 13a8 8 0 008 8z" />
    </svg>
  );
}
function IconWaterSplash() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a8 8 0 008-8c0-4.418-8-12-8-12S4 8.582 4 13a8 8 0 008 8z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17l2-2 2 2" />
    </svg>
  );
}
function IconWaterNo() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}
function Icon4K() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5" />
    </svg>
  );
}
function IconHD() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}
function IconShrug() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
    </svg>
  );
}
function IconDays() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}
function IconBudget() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.25 7.756a4.5 4.5 0 100 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

/* ───────────────────────── Questions ─────────────────────────────────────── */

const questions: Question[] = [
  {
    title: 'Was moechtest du hauptsaechlich filmen?',
    options: [
      { label: 'Sport & Action', icon: <IconSport />, value: 'sport' },
      { label: 'Reise & Vlog', icon: <IconTravel />, value: 'travel' },
      { label: 'Unterwasser', icon: <IconUnderwater />, value: 'underwater' },
      { label: 'Zeitraffer & Natur', icon: <IconTimelapse />, value: 'timelapse' },
      { label: 'Events & Feiern', icon: <IconEvent />, value: 'events' },
      { label: 'Sonstiges', icon: <IconOther />, value: 'other' },
    ],
  },
  {
    title: 'Brauchst du Wasserschutz?',
    options: [
      { label: 'Ja, Unterwasser (tieftauchen)', icon: <IconWaterYes />, value: 'deep' },
      { label: 'Ja, Spritzwasserschutz reicht', icon: <IconWaterSplash />, value: 'splash' },
      { label: 'Nein', icon: <IconWaterNo />, value: 'none' },
    ],
  },
  {
    title: 'Welche Videoqualitaet brauchst du?',
    options: [
      { label: '4K oder besser', icon: <Icon4K />, value: '4k_plus' },
      { label: 'Full HD reicht', icon: <IconHD />, value: 'hd' },
      { label: 'Ist mir egal', icon: <IconShrug />, value: 'any' },
    ],
  },
  {
    title: 'Wie lange brauchst du die Kamera?',
    options: [
      { label: '1\u20133 Tage', icon: <IconDays />, value: '1-3' },
      { label: '4\u20137 Tage', icon: <IconDays />, value: '4-7' },
      { label: '1\u20132 Wochen', icon: <IconDays />, value: '1-2w' },
      { label: 'Laenger als 2 Wochen', icon: <IconDays />, value: '2w+' },
    ],
  },
  {
    title: 'Was ist dein Budget pro Tag?',
    options: [
      { label: 'Bis 12 \u20ac', icon: <IconBudget />, value: 'low' },
      { label: '12\u201316 \u20ac', icon: <IconBudget />, value: 'mid' },
      { label: '\u00dcber 16 \u20ac', icon: <IconBudget />, value: 'high' },
      { label: 'Budget ist egal', icon: <IconBudget />, value: 'any' },
    ],
  },
];

/* ───────────────────────── Recommendation logic ──────────────────────────── */

function parseWaterproofDepth(wp: string): number {
  const match = wp.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseResolutionRank(res: string): number {
  const lower = res.toLowerCase();
  if (lower.includes('8k')) return 3;
  if (lower.includes('5.3k') || lower.includes('5k')) return 2;
  if (lower.includes('4k')) return 1;
  return 0;
}

function parseFps(fps: string): number {
  const match = fps.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 30;
}

function parseBattery(battery: string): number {
  const match = battery.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

interface ScoredProduct {
  product: Product;
  score: number;
  reasons: string[];
}

function computeRecommendations(answers: Answers): ScoredProduct[] {
  const scored: ScoredProduct[] = products
    .filter((p) => p.category === 'action-cam' || p.category === '360-cam')
    .map((product) => {
      let score = 0;
      const reasons: string[] = [];

      const depth = parseWaterproofDepth(product.specs.waterproof);
      const resRank = parseResolutionRank(product.specs.resolution);
      const fps = parseFps(product.specs.fps);
      const battery = parseBattery(product.specs.battery);

      // --- Usage ---
      switch (answers.usage) {
        case 'sport':
          if (fps >= 120) { score += 30; reasons.push(`${product.specs.fps} fuer fluessige Action-Aufnahmen`); }
          else if (fps >= 60) { score += 15; reasons.push(`${product.specs.fps} fuer Sport-Videos`); }
          if (product.specs.resolution.toLowerCase().includes('360')) { score += 10; reasons.push('360\u00b0-Perspektive ideal fuer dynamische Szenen'); }
          break;
        case 'travel':
          if (battery >= 1900) { score += 25; reasons.push(`${product.specs.battery} Akku fuer lange Drehtage`); }
          else if (battery >= 1770) { score += 15; reasons.push('Gute Akkulaufzeit fuer unterwegs'); }
          if (resRank >= 2) { score += 10; reasons.push('Hohe Aufloesung fuer beeindruckende Reisevideos'); }
          break;
        case 'underwater':
          if (depth >= 40) { score += 35; reasons.push(`Wasserdicht bis ${depth}m \u2013 perfekt zum Tauchen`); }
          else if (depth >= 10) { score += 20; reasons.push(`Wasserdicht bis ${depth}m fuer Unterwasseraufnahmen`); }
          break;
        case 'timelapse':
          if (resRank >= 2) { score += 25; reasons.push('Hohe Aufloesung fuer detailreiche Zeitraffer'); }
          if (battery >= 1900) { score += 15; reasons.push('Langer Akku fuer ausgedehnte Zeitraffer-Aufnahmen'); }
          break;
        case 'events':
          if (battery >= 1800) { score += 20; reasons.push('Langer Akku fuer Event-Aufnahmen'); }
          if (resRank >= 1) { score += 10; reasons.push('Gute Videoqualitaet fuer Erinnerungen'); }
          if (product.specs.resolution.toLowerCase().includes('360')) { score += 15; reasons.push('360\u00b0-Video faengt die ganze Atmosphaere ein'); }
          break;
        default:
          score += 10;
          reasons.push('Vielseitig einsetzbar');
          break;
      }

      // --- Waterproof ---
      switch (answers.waterproof) {
        case 'deep':
          if (depth >= 40) { score += 30; reasons.push(`Bis ${depth}m Tauchtiefe ohne Gehaeuse`); }
          else if (depth >= 10) { score += 15; }
          break;
        case 'splash':
          if (depth >= 10) { score += 15; }
          break;
        case 'none':
          break;
      }

      // --- Quality ---
      switch (answers.quality) {
        case '4k_plus':
          if (resRank >= 3) { score += 25; reasons.push(`${product.specs.resolution} \u2013 gestochen scharfe Aufnahmen`); }
          else if (resRank >= 2) { score += 20; }
          else if (resRank >= 1) { score += 10; }
          break;
        case 'hd':
          score += 10;
          break;
        case 'any':
          score += 5;
          break;
      }

      // --- Budget ---
      const ppd = product.pricePerDay;
      switch (answers.budget) {
        case 'low':
          if (ppd <= 12) { score += 20; reasons.push(`Nur ${ppd} \u20ac/Tag`); }
          else { score -= 10; }
          break;
        case 'mid':
          if (ppd >= 12 && ppd <= 16) { score += 20; reasons.push(`${ppd} \u20ac/Tag \u2013 im Budget`); }
          else if (ppd < 12) { score += 10; }
          else { score -= 5; }
          break;
        case 'high':
          if (ppd > 16) { score += 15; }
          else { score += 5; }
          break;
        case 'any':
          break;
      }

      // --- Availability bonus ---
      if (product.available) {
        score += 10;
        reasons.push('Sofort verfuegbar');
      }

      return { product, score, reasons };
    });

  // Sort by score descending, take top 3
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

/* ───────────────────────── Progress Bar ──────────────────────────────────── */

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-body font-medium text-brand-steel dark:text-gray-400">
          Frage {current + 1} von {total}
        </span>
        <span className="text-sm font-body font-medium text-brand-steel dark:text-gray-400">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="w-full h-2 bg-brand-bg dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent-blue rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ───────────────────────── Results View ──────────────────────────────────── */

function ResultsView({
  results,
  onRestart,
}: {
  results: ScoredProduct[];
  onRestart: () => void;
}) {
  const hasResults = results.length > 0;
  const topScore = hasResults ? results[0].score : 0;

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-blue-soft text-accent-blue mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100 mb-2">
          {hasResults ? 'Unsere Empfehlung fuer dich' : 'Keine passende Kamera gefunden'}
        </h2>
        <p className="font-body text-brand-steel dark:text-gray-400 max-w-lg mx-auto">
          {hasResults
            ? 'Basierend auf deinen Angaben haben wir die besten Kameras fuer dich ausgewaehlt.'
            : 'Versuche es mit anderen Kriterien oder schau dir alle Kameras an.'}
        </p>
      </div>

      {hasResults && (
        <div className="grid gap-6 md:grid-cols-3 mb-10">
          {results.map(({ product, score, reasons }, idx) => {
            const isTop = idx === 0;
            const isBestAlt = !isTop && score < topScore * 0.7;

            // Deduplicate reasons and take top 2
            const uniqueReasons = [...new Set(reasons.filter((r) => r !== 'Sofort verfuegbar'))].slice(0, 2);

            return (
              <div
                key={product.id}
                className={`relative flex flex-col rounded-card border bg-white dark:bg-gray-800 overflow-hidden transition-shadow hover:shadow-card ${
                  isTop ? 'border-accent-blue shadow-card ring-1 ring-accent-blue/20' : 'border-brand-border dark:border-gray-700'
                }`}
              >
                {isTop && (
                  <div className="bg-accent-blue text-white text-xs font-heading font-semibold text-center py-1.5">
                    Beste Empfehlung
                  </div>
                )}
                {isBestAlt && (
                  <div className="bg-brand-bg dark:bg-gray-700 text-brand-steel dark:text-gray-400 text-xs font-heading font-semibold text-center py-1.5">
                    Beste Alternative
                  </div>
                )}

                <div className="p-5 flex flex-col flex-1">
                  {/* Brand badge */}
                  <span className="inline-flex self-start items-center px-2.5 py-0.5 rounded-full text-xs font-body font-medium bg-brand-bg dark:bg-gray-700 text-brand-steel dark:text-gray-400 mb-3">
                    {product.brand}
                  </span>

                  <h3 className="font-heading font-bold text-lg text-brand-black dark:text-gray-100 mb-2">
                    {product.name}
                  </h3>

                  {/* Reasons */}
                  <ul className="space-y-1.5 mb-4 flex-1">
                    {uniqueReasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm font-body text-brand-text dark:text-gray-300">
                        <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {r}
                      </li>
                    ))}
                  </ul>

                  {/* Price & availability */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-xl font-heading font-bold text-brand-black dark:text-gray-100">
                        {product.pricePerDay} \u20ac
                      </span>
                      <span className="text-sm text-brand-steel dark:text-gray-400 font-body"> / Tag</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-body font-medium px-2 py-1 rounded-full ${
                        product.available
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          product.available ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      {product.available ? 'Verfuegbar' : 'Nicht verfuegbar'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    {product.available && (
                      <Link
                        href={`/kameras/${product.slug}/buchen`}
                        className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-blue-600 transition-colors"
                      >
                        Jetzt buchen
                      </Link>
                    )}
                    <Link
                      href={`/kameras/${product.slug}`}
                      className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-brand-bg dark:bg-gray-700 text-brand-black dark:text-gray-100 font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-border dark:hover:bg-gray-600 transition-colors"
                    >
                      Details ansehen
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-center">
        <button
          onClick={onRestart}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-bg dark:bg-gray-700 text-brand-black dark:text-gray-100 font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-border dark:hover:bg-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          Fragebogen neu starten
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── Main Component ────────────────────────────────── */

export default function KameraFinderPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Answers>>({});
  const [showResults, setShowResults] = useState(false);

  const answerKeys: (keyof Answers)[] = ['usage', 'waterproof', 'quality', 'duration', 'budget'];

  const handleSelect = useCallback(
    (value: string) => {
      const key = answerKeys[step];
      const newAnswers = { ...answers, [key]: value };
      setAnswers(newAnswers);

      if (step < questions.length - 1) {
        setStep(step + 1);
      } else {
        setShowResults(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, answers],
  );

  const handleBack = useCallback(() => {
    if (showResults) {
      setShowResults(false);
    } else if (step > 0) {
      setStep(step - 1);
    }
  }, [step, showResults]);

  const handleRestart = useCallback(() => {
    setStep(0);
    setAnswers({});
    setShowResults(false);
  }, []);

  const results = showResults ? computeRecommendations(answers as Answers) : [];

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <section className="bg-gradient-to-br from-accent-blue via-blue-600 to-blue-800 text-white py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="font-heading font-bold text-3xl sm:text-4xl mb-3">
            Kamera-Finder
          </h1>
          <p className="font-body text-white/80 text-lg max-w-xl mx-auto">
            Beantworte 5 kurze Fragen und wir finden die perfekte Action-Cam fuer dich.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {!showResults ? (
          <div className="animate-fade-in" key={step}>
            <ProgressBar current={step} total={questions.length} />

            {/* Back button */}
            {step > 0 && (
              <button
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 mb-6 text-sm font-body font-medium text-brand-steel dark:text-gray-400 hover:text-brand-black dark:hover:text-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Zurueck
              </button>
            )}

            {/* Question */}
            <h2 className="font-heading font-bold text-xl sm:text-2xl text-brand-black dark:text-gray-100 mb-6">
              {questions[step].title}
            </h2>

            {/* Options grid */}
            <div
              className={`grid gap-3 ${
                questions[step].options.length <= 3
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {questions[step].options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className="group flex flex-col items-center gap-3 p-5 sm:p-6 rounded-card border border-brand-border dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-accent-blue hover:shadow-card transition-all duration-200 text-center cursor-pointer"
                >
                  <span className="flex items-center justify-center w-14 h-14 rounded-full bg-brand-bg dark:bg-gray-700 text-brand-steel dark:text-gray-400 group-hover:bg-accent-blue-soft dark:group-hover:bg-accent-blue/20 group-hover:text-accent-blue transition-colors">
                    {opt.icon}
                  </span>
                  <span className="font-heading font-semibold text-sm text-brand-black dark:text-gray-100">
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ResultsView results={results} onRestart={handleRestart} />
        )}
      </section>
    </main>
  );
}

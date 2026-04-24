'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { BUSINESS } from '@/lib/business-config';

interface ContractParagraph {
  title: string;
  text: string;
}

// ─── Vertragstext (Plaintext für die UI-Anzeige) ────────────────────────────
// Baut den vollständigen Vertragstext zusammen aus:
//   1. Header: Parteien, Mietgegenstand, Mietzeitraum, Entgelt (dynamisch aus props)
//   2. Vertragsbedingungen: die Paragraphen aus admin_settings.contract_paragraphs
//      (oder Fallback auf Defaults). Dadurch stimmt der Buchungsflow-Text mit
//      dem Mietvertrag-PDF ueberein — aus einer Quelle, nicht hartcodiert.
//   3. Einwilligungserklärung (konstant)

function buildDisplayText(opts: {
  customerName: string;
  customerEmail: string;
  productName: string;
  accessories: string[];
  rentalFrom: string;
  rentalTo: string;
  rentalDays: number;
  priceTotal: number;
  deposit: number;
  paragraphs: ContractParagraph[];
}) {
  const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
  const divider = '─'.repeat(40);
  const accessoriesLine = opts.accessories.length > 0
    ? `\nZubehör: ${opts.accessories.join(', ')}`
    : '';

  const header = `KAMERA-MIETVERTRAG

Vertragsparteien

Vermieter:
${BUSINESS.name} | ${BUSINESS.owner}
${BUSINESS.street}, ${BUSINESS.zip} ${BUSINESS.city}
${BUSINESS.email} | ${BUSINESS.url}

Mieter:
${opts.customerName}
${opts.customerEmail}

Mietgegenstand:
${opts.productName}${accessoriesLine}

Mietzeitraum:
${opts.rentalFrom} bis ${opts.rentalTo} (${opts.rentalDays} Tag${opts.rentalDays !== 1 ? 'e' : ''})

Entgelt:
Gesamtbetrag: ${fmt(opts.priceTotal)}
Kaution / Vorautorisierung: ${fmt(opts.deposit)}
Zahlung erfolgt über Stripe (Kreditkarte / SEPA-Lastschrift).

${divider}

VERTRAGSBEDINGUNGEN
`;

  const paragraphsBlock = opts.paragraphs.map((p, i) => {
    // Titel enthaelt meist schon die "§ N" Nummer (z.B. "§ 1 Vertragsgegenstand");
    // falls nicht, setzen wir sie davor, damit die Anzeige zum PDF passt.
    const hasSectionMark = /^\s*§\s*\d+/.test(p.title);
    const title = hasSectionMark ? p.title.trim() : `§ ${i + 1} – ${p.title.trim()}`;
    return `\n${title}\n${p.text.trim()}\n`;
  }).join('');

  const footer = `
${divider}

Einwilligungserklärung:
Mit meiner digitalen Unterschrift bestätige ich:
1. Ich habe diesen Mietvertrag vollständig gelesen und verstanden.
2. Ich stimme allen Bedingungen zu.
3. Ich bin volljährig (mindestens 18 Jahre) und geschäftsfähig.
4. Meine Kontakt- und Zahlungsdaten sind korrekt.
5. Diese digitale Signatur gilt gemäß eIDAS-Verordnung (EU) 2014/910 als rechtsgültige elektronische Signatur.`;

  return header + paragraphsBlock + footer;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SignatureStepProps {
  customerName: string;
  customerEmail: string;
  productName: string;
  accessories: string[];
  rentalFrom: string;            // 'DD.MM.YYYY'
  rentalTo: string;              // 'DD.MM.YYYY'
  rentalDays: number;
  priceTotal: number;
  deposit: number;
  onSigned: (data: SignatureResult) => void;
  onBack: () => void;
}

export interface SignatureResult {
  signatureDataUrl: string | null;
  signatureMethod: 'canvas' | 'typed';
  signerName: string;
  agreedToTerms: boolean;
}

// ─── Komponente ───────────────────────────────────────────────────────────────

export default function SignatureStep({
  customerName,
  customerEmail,
  productName,
  accessories,
  rentalFrom,
  rentalTo,
  rentalDays,
  priceTotal,
  deposit,
  onSigned,
  onBack,
}: SignatureStepProps) {
  const sigPadRef = useRef<SignatureCanvas>(null);
  const contractRef = useRef<HTMLDivElement>(null);

  const [useTypedName, setUseTypedName] = useState(false);
  const [typedName, setTypedName] = useState(customerName || '');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paragraphs, setParagraphs] = useState<ContractParagraph[] | null>(null);
  const [paragraphsLoading, setParagraphsLoading] = useState(true);

  // Paragraphen aus admin_settings laden (oeffentlicher Endpoint).
  // Quelle: /api/contract-paragraphs — liefert die custom-Paragraphen
  // oder Fallback auf die hardcoded Defaults.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/contract-paragraphs')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d?.paragraphs)) {
          setParagraphs(d.paragraphs);
        }
      })
      .catch(() => { /* Fallback: Leere Liste -> UI-Fallback unten */ })
      .finally(() => {
        if (!cancelled) setParagraphsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Vertragstext — baut sich erst wenn Paragraphen geladen sind.
  const contractText = paragraphs
    ? buildDisplayText({
        customerName,
        customerEmail,
        productName,
        accessories,
        rentalFrom,
        rentalTo,
        rentalDays,
        priceTotal,
        deposit,
        paragraphs,
      })
    : '';

  // Scroll-Erkennung
  const handleScroll = useCallback(() => {
    const el = contractRef.current;
    if (!el) return;
    const threshold = 40;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      setScrolledToBottom(true);
    }
  }, []);

  // Prüfen ob Vertragstext kürzer als Container ist (kein Scrollen nötig)
  useEffect(() => {
    const el = contractRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 10) {
      setScrolledToBottom(true);
    }
  }, [contractText]);

  // Unterschrift-Validierung
  const hasSignature = useTypedName ? typedName.trim().length >= 2 : hasDrawn;
  const isValid = hasSignature && agreedToTerms && scrolledToBottom && !paragraphsLoading;

  // Fehlende Bedingungen für Tooltip
  const missingItems: string[] = [];
  if (paragraphsLoading) missingItems.push('Vertrag wird geladen');
  if (!scrolledToBottom) missingItems.push('Vertrag bis zum Ende lesen');
  if (!hasSignature) missingItems.push('Unterschreiben');
  if (!agreedToTerms) missingItems.push('Checkbox bestätigen');

  const handleClear = () => {
    sigPadRef.current?.clear();
    setHasDrawn(false);
  };

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);

    try {
      let signatureDataUrl: string | null = null;
      if (!useTypedName && sigPadRef.current) {
        signatureDataUrl = sigPadRef.current.toDataURL('image/png');
      }

      onSigned({
        signatureDataUrl,
        signatureMethod: useTypedName ? 'typed' : 'canvas',
        signerName: useTypedName ? typedName.trim() : customerName,
        agreedToTerms: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">
        Mietvertrag
      </h2>
      <p className="text-sm font-body text-brand-steel dark:text-gray-400 mb-6">
        Bitte lies den Vertrag vollständig durch und unterschreibe ihn digital, um fortzufahren.
      </p>

      {/* ── Vertragstext (scrollbar) ── */}
      <div className="relative mb-6">
        <div
          ref={contractRef}
          onScroll={handleScroll}
          className="overflow-y-auto max-h-72 border border-brand-border dark:border-gray-700 rounded-lg p-4 text-sm text-slate-600 dark:text-gray-300 bg-white dark:bg-gray-900 whitespace-pre-wrap font-mono leading-relaxed"
        >
          {paragraphsLoading
            ? 'Vertrag wird geladen...'
            : contractText || 'Vertragstext konnte nicht geladen werden. Bitte Seite neu laden.'}
        </div>
        {/* Scroll-Gradient */}
        {!scrolledToBottom && !paragraphsLoading && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-900 to-transparent rounded-b-lg pointer-events-none" />
        )}
        {/* Scroll-Hinweis */}
        {!scrolledToBottom && !paragraphsLoading && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-brand-black/80 text-white text-xs rounded-full pointer-events-none">
            <svg className="w-3.5 h-3.5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            Nach unten scrollen
          </div>
        )}
      </div>

      {/* ── Unterschrift ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-heading font-semibold text-brand-black dark:text-white">
            Deine Unterschrift
          </p>
          <button
            type="button"
            onClick={() => {
              setUseTypedName(!useTypedName);
              handleClear();
            }}
            className="text-xs font-heading font-semibold text-accent-blue hover:underline"
          >
            {useTypedName ? 'Stattdessen zeichnen' : 'Stattdessen Namen eintippen'}
          </button>
        </div>

        {useTypedName ? (
          /* Getippter Name */
          <div className="border border-brand-border dark:border-gray-700 rounded-lg bg-slate-50 dark:bg-gray-800 p-4">
            <label className="block text-xs font-body text-brand-muted mb-2">
              Dein vollständiger Name
            </label>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Vor- und Nachname"
              className="w-full px-4 py-3 rounded-lg border border-brand-border dark:border-gray-600 bg-white dark:bg-gray-900 text-brand-black dark:text-white text-lg font-heading font-semibold focus:outline-none focus:ring-2 focus:ring-accent-blue"
            />
            {typedName.trim().length >= 2 && (
              <p className="text-xs text-status-success mt-2">
                Signiert als: {typedName.trim()}
              </p>
            )}
          </div>
        ) : (
          /* Canvas-Unterschrift */
          <div className="border border-brand-border dark:border-gray-700 rounded-lg bg-slate-50 dark:bg-gray-800 overflow-hidden">
            <div className="relative">
              <SignatureCanvas
                ref={sigPadRef}
                penColor="#0a0a0a"
                canvasProps={{
                  className: 'w-full',
                  style: { height: 150, background: 'transparent' },
                }}
                onEnd={() => setHasDrawn(true)}
              />
              {/* Gestrichelte Grundlinie */}
              {!hasDrawn && (
                <div className="absolute bottom-8 left-8 right-8 border-b border-dashed border-slate-300 dark:border-gray-600 pointer-events-none" />
              )}
              {!hasDrawn && (
                <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-slate-300 dark:text-gray-600 pointer-events-none">
                  Hier unterschreiben
                </p>
              )}
            </div>
          </div>
        )}

        {/* Löschen-Button */}
        {!useTypedName && (
          <button
            type="button"
            onClick={handleClear}
            className="mt-2 text-xs font-heading font-semibold text-brand-muted hover:text-brand-steel flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Löschen
          </button>
        )}
      </div>

      {/* ── Checkbox ── */}
      <label className="flex items-start gap-3 p-4 rounded-xl border border-brand-border dark:border-gray-700 bg-white dark:bg-gray-900 cursor-pointer mb-6 hover:border-accent-blue transition-colors">
        <input
          type="checkbox"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-0.5 accent-accent-blue flex-shrink-0"
        />
        <span className="text-sm font-body text-brand-steel dark:text-gray-300">
          Ich habe den Mietvertrag vollständig gelesen und stimme allen Bedingungen zu.
        </span>
      </label>

      {/* ── Buttons ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="px-6 py-3 text-brand-steel font-heading font-semibold text-sm rounded-[10px] border border-brand-border hover:bg-brand-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Zurück
        </button>

        <div className="relative group">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="flex items-center gap-2 px-8 py-3 bg-cyan-500 text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Wird gespeichert...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Vertrag unterschreiben
              </>
            )}
          </button>

          {/* Tooltip bei disabled Button */}
          {!isValid && missingItems.length > 0 && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-brand-black text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Bitte: {missingItems.map((item, i) => (
                <span key={i}>{i > 0 ? ', ' : ''}{'①②③④'[i] ?? ''} {item}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

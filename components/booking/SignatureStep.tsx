'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { BUSINESS } from '@/lib/business-config';

// ─── Vertragstext (Plaintext fuer die UI-Anzeige) ────────────────────────────

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
}) {
  const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' \u20ac';
  return `KAMERA-MIETVERTRAG

Vertragsparteien

Vermieter:
${BUSINESS.name} | ${BUSINESS.owner}
${BUSINESS.street}, ${BUSINESS.zip} ${BUSINESS.city}
${BUSINESS.email} | ${BUSINESS.url}

Mieter:
${opts.customerName}
${opts.customerEmail}

\u00a7 1 \u2013 Mietgegenstand
(1) Der Vermieter vermietet dem Mieter folgende(s) Geraet(e):
${opts.productName}${opts.accessories.length > 0 ? `\nZubehoer: ${opts.accessories.join(', ')}` : ''}
(2) Der Mietgegenstand ist Eigentum des Vermieters.
(3) Weitervermietung an Dritte ist untersagt.

\u00a7 2 \u2013 Mietzeitraum
Mietbeginn: ${opts.rentalFrom}
Mietende: ${opts.rentalTo}
Mietdauer: ${opts.rentalDays} Tag${opts.rentalDays !== 1 ? 'e' : ''}

\u00a7 3 \u2013 Mietpreis und Zahlung
Gesamtbetrag: ${fmt(opts.priceTotal)}
Zahlung erfolgt über Stripe per Kreditkarte oder SEPA-Lastschrift.

\u00a7 4 \u2013 Kaution (Vorautorisierung)
Vorautorisierung: ${fmt(opts.deposit)}
Wird nach ordnungsgemäßer Rückgabe vollständig freigegeben.
Bei Schäden oder Verlust kann die Vorautorisierung eingezogen werden.

\u00a7 5 \u2013 Versand und Übergabe
Mietgegenstand wird per Paketdienstleister versendet.
Mängel innerhalb von 24 Stunden nach Empfang per E-Mail an ${BUSINESS.email} melden.

\u00a7 6 \u2013 Sorgfaltspflicht
Der Mieter behandelt den Mietgegenstand sorgsam und schützt ihn vor Wasser, Stößen und Überhitzung.
Keine eigenmächtigen Reparaturversuche.

\u00a7 7 \u2013 Haftung bei Schäden und Verlust
Der Mieter haftet für alle Schäden während des Mietzeitraums.
Bei Totalschaden/Verlust: Ersatz des Wiederbeschaffungswertes.

\u00a7 8 \u2013 Verspätete Rückgabe
Pro angefangenem Tag: regulärer Tagespreis + 5,00 \u20ac Bearbeitungsgebühr.
Ab 3 Werktagen Verspätung ohne Absprache: Strafanzeige möglich.

\u00a7 9 \u2013 Stornierung
Mehr als 7 Tage vor Mietbeginn: 100% Erstattung.
3\u20137 Tage vorher: 50% Erstattung.
Weniger als 3 Tage: keine Erstattung.

\u00a7 10 \u2013 Datenschutz
Datenverarbeitung gemäß DSGVO. Details: ${BUSINESS.url}/datenschutz

\u00a7 11 \u2013 Haftungsbeschränkung des Vermieters
Haftung des Vermieters bei leichter Fahrlässigkeit auf vorhersehbare Schäden begrenzt.
Keine Haftung für Datenverluste auf Speicherkarten.

\u00a7 12 \u2013 Schlussbestimmungen
Deutsches Recht. Gerichtsstand: ${BUSINESS.city}.
Salvatorische Klausel. Änderungen bedürfen der Textform.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Einwilligungserklärung:
Mit meiner digitalen Unterschrift bestätige ich:
1. Ich habe diesen Mietvertrag vollständig gelesen und verstanden.
2. Ich stimme allen Bedingungen zu.
3. Ich bin volljährig (mindestens 18 Jahre) und geschäftsfähig.
4. Meine Kontakt- und Zahlungsdaten sind korrekt.
5. Diese digitale Signatur gilt gemäß eIDAS-Verordnung (EU) 2014/910 als rechtsgültige elektronische Signatur.`;
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

  // Vertragstext
  const contractText = buildDisplayText({
    customerName,
    customerEmail,
    productName,
    accessories,
    rentalFrom,
    rentalTo,
    rentalDays,
    priceTotal,
    deposit,
  });

  // Scroll-Erkennung
  const handleScroll = useCallback(() => {
    const el = contractRef.current;
    if (!el) return;
    const threshold = 40;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      setScrolledToBottom(true);
    }
  }, []);

  // Pruefen ob Vertragstext kuerzer als Container ist (kein Scrollen noetig)
  useEffect(() => {
    const el = contractRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 10) {
      setScrolledToBottom(true);
    }
  }, []);

  // Unterschrift-Validierung
  const hasSignature = useTypedName ? typedName.trim().length >= 2 : hasDrawn;
  const isValid = hasSignature && agreedToTerms && scrolledToBottom;

  // Fehlende Bedingungen fuer Tooltip
  const missingItems: string[] = [];
  if (!scrolledToBottom) missingItems.push('Vertrag bis zum Ende lesen');
  if (!hasSignature) missingItems.push('Unterschreiben');
  if (!agreedToTerms) missingItems.push('Checkbox bestaetigen');

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
        Bitte lies den Vertrag vollstaendig durch und unterschreibe ihn digital, um fortzufahren.
      </p>

      {/* ── Vertragstext (scrollbar) ── */}
      <div className="relative mb-6">
        <div
          ref={contractRef}
          onScroll={handleScroll}
          className="overflow-y-auto max-h-72 border border-brand-border dark:border-gray-700 rounded-lg p-4 text-sm text-slate-600 dark:text-gray-300 bg-white dark:bg-gray-900 whitespace-pre-wrap font-mono leading-relaxed"
        >
          {contractText}
        </div>
        {/* Scroll-Gradient */}
        {!scrolledToBottom && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-900 to-transparent rounded-b-lg pointer-events-none" />
        )}
        {/* Scroll-Hinweis */}
        {!scrolledToBottom && (
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
              Dein vollstaendiger Name
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
          Ich habe den Mietvertrag vollstaendig gelesen und stimme allen Bedingungen zu.
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
                <span key={i}>{i > 0 ? ', ' : ''}{'\u2460\u2461\u2462'[i]} {item}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

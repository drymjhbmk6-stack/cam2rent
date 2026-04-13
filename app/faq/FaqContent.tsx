'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BUSINESS } from '@/lib/business-config';

/* ------------------------------------------------------------------ */
/*  Daten                                                              */
/* ------------------------------------------------------------------ */

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

interface FaqSection {
  title: string;
  icon: React.ReactNode;
  color: 'blue' | 'teal' | 'amber' | 'rose' | 'violet' | 'emerald';
  items: FaqItem[];
}

const colorConfig = {
  blue: {
    bg: 'bg-accent-blue-soft dark:bg-accent-blue/15',
    text: 'text-accent-blue',
    border: 'border-accent-blue/20',
    ring: 'ring-accent-blue/20',
    dot: 'bg-accent-blue',
  },
  teal: {
    bg: 'bg-accent-teal-soft dark:bg-accent-teal/15',
    text: 'text-accent-teal',
    border: 'border-accent-teal/20',
    ring: 'ring-accent-teal/20',
    dot: 'bg-accent-teal',
  },
  amber: {
    bg: 'bg-accent-amber-soft dark:bg-accent-amber/15',
    text: 'text-accent-amber',
    border: 'border-accent-amber/20',
    ring: 'ring-accent-amber/20',
    dot: 'bg-accent-amber',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-500/15',
    text: 'text-rose-500',
    border: 'border-rose-200',
    ring: 'ring-rose-500/20',
    dot: 'bg-rose-500',
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-500/15',
    text: 'text-violet-500',
    border: 'border-violet-200',
    ring: 'ring-violet-500/20',
    dot: 'bg-violet-500',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    text: 'text-emerald-500',
    border: 'border-emerald-200',
    ring: 'ring-emerald-500/20',
    dot: 'bg-emerald-500',
  },
};

const faqSections: FaqSection[] = [
  {
    title: 'Buchung & Ablauf',
    color: 'blue',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    items: [
      {
        question: 'Wie kann ich eine Kamera mieten?',
        answer: (
          <>
            Wähle die gewünschte Kamera auf unserer{' '}
            <Link href="/kameras" className="text-accent-blue hover:underline font-medium">Kamera-Seite</Link> aus,
            prüfe die Verfügbarkeit im Kalender (grün = verfügbar, rot = gebucht), wähle deinen
            Mietzeitraum und lege die Kamera in den Warenkorb. Nach dem Checkout erhältst du eine
            Buchungsbestätigung per E-Mail.
          </>
        ),
      },
      {
        question: 'Brauche ich ein Kundenkonto?',
        answer:
          'Ja, für die Buchung ist ein Kundenkonto erforderlich. Die Registrierung dauert nur wenige Sekunden und ermöglicht dir Zugriff auf deine Buchungsübersicht, Rücksende-Etiketten und vieles mehr.',
      },
      {
        question: 'Gibt es eine Mindestmietdauer?',
        answer:
          'Nein, es gibt keine Mindestmietdauer. Du kannst eine Kamera ab einem Tag mieten. Je länger die Mietdauer, desto günstiger wird der Tagespreis — ab 5 Tagen gibt es automatisch Mengenrabatte.',
      },
      {
        question: 'Kann ich meine Mietdauer verlängern?',
        answer: (
          <>
            Ja! Über dein{' '}
            <Link href="/konto/buchungen" className="text-accent-blue hover:underline font-medium">Kundenkonto</Link>{' '}
            kannst du die Mietdauer verlängern, sofern die Kamera im Anschlusszeitraum verfügbar ist.
            Die Zusatzkosten werden automatisch berechnet und abgebucht.
          </>
        ),
      },
      {
        question: 'Wie läuft die Buchung Schritt für Schritt ab?',
        answer: (
          <span className="space-y-2 block">
            <span className="block">Die Buchung ist in 5 einfache Schritte aufgeteilt:</span>
            <span className="block"><strong>1. Versand</strong> — Wähle, ob du die Ausrüstung per DHL geliefert bekommen oder selbst abholen möchtest.</span>
            <span className="block"><strong>2. Zubehör</strong> — Optional kannst du passendes Zubehör wie Speicherkarten, Akkus oder Stative dazubuchen.</span>
            <span className="block"><strong>3. Haftungsschutz</strong> — Entscheide dich für eine Haftungsoption: Standard oder Premium.</span>
            <span className="block"><strong>4. Zusammenfassung</strong> — Prüfe alle Details deiner Buchung: Zeitraum, Zubehör, Haftungsschutz und Gesamtpreis.</span>
            <span className="block"><strong>5. Zahlung</strong> — Bezahle sicher über Stripe mit Kreditkarte, Klarna, Apple Pay, Google Pay oder SEPA-Lastschrift.</span>
          </span>
        ),
      },
      {
        question: 'Wie weit im Voraus kann ich buchen?',
        answer: 'Du kannst bis zu 6 Monate im Voraus buchen. Im Kalender siehst du in Echtzeit, welche Tage noch verfügbar (grün) oder bereits ausgebucht (rot) sind.',
      },
      {
        question: 'Was ist im Versandpreis enthalten?',
        answer: 'Der Versandpreis beinhaltet sowohl den Hinversand als auch den Rückversand. Ein frankiertes Rücksendeetikett liegt dem Paket bei — du musst dich um nichts kümmern.',
      },
      {
        question: 'Wie lange dauert die Kautionsfreigabe?',
        answer: 'Nach erfolgreicher Rückgabe und Zustandsprüfung wird die Kaution innerhalb von 5 Werktagen auf deinem Konto freigegeben.',
      },
    ],
  },
  {
    title: 'Versand & Abholung',
    color: 'teal',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    items: [
      {
        question: 'Wie wird die Ausrüstung geliefert?',
        answer:
          'Wir versenden per DHL Standardversand (2–3 Werktage) oder DHL Express (nächster Werktag). Die Ausrüstung wird in der Regel einen Werktag vor Mietbeginn versendet. Ab 49 € Bestellwert ist der Standardversand kostenlos.',
      },
      {
        question: 'Kann ich die Ausrüstung auch abholen?',
        answer:
          `Ja! Selbstabholung ist in ${BUSINESS.pickupLocation} kostenlos möglich. Die Abholung erfolgt in der Regel einen Tag vor Mietbeginn. Den genauen Termin vereinbarst du bei der Buchung.`,
      },
    ],
  },
  {
    title: 'Rückgabe',
    color: 'amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
      </svg>
    ),
    items: [
      {
        question: 'Wie gebe ich die Ausrüstung zurück?',
        answer: (
          <>
            Packe die Ausrüstung vollständig zurück (Originalverpackung bevorzugt) und verwende
            das beigelegte DHL-Rücksende-Etikett. Falls du es nicht mehr hast, kannst du es in
            deinem{' '}
            <Link href="/konto/buchungen" className="text-accent-blue hover:underline font-medium">Kundenkonto</Link>{' '}
            herunterladen. Die Rücksendung muss spätestens am Tag nach Mietende bei DHL abgegeben
            werden.
          </>
        ),
      },
      {
        question: 'Was passiert bei verspäteter Rückgabe?',
        answer:
          'Für jeden zusätzlichen Tag wird der reguläre Tagespreis berechnet. Bei erheblicher Verspätung (mehr als 3 Tage ohne Rückmeldung) behalten wir uns die Einbehaltung der Kaution sowie weitere Schritte vor.',
      },
    ],
  },
  {
    title: 'Kaution & Zahlung',
    color: 'violet',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    items: [
      {
        question: 'Wie funktioniert die Kaution?',
        answer:
          'Bei jeder Buchung wird eine Kaution als Vorautorisierung auf deiner Kreditkarte blockiert — der Betrag wird nicht abgebucht, nur reserviert. Nach erfolgreicher Rückgabe und Zustandsprüfung wird die Vorautorisierung automatisch freigegeben, in der Regel noch am selben Tag.',
      },
      {
        question: 'Welche Zahlungsmethoden gibt es?',
        answer:
          'Wir akzeptieren Visa, Mastercard, Klarna, Apple Pay, Google Pay und SEPA-Lastschrift. Die Bezahlung erfolgt sicher über Stripe. Barzahlung ist nicht möglich.',
      },
    ],
  },
  {
    title: 'Stornierung',
    color: 'rose',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    items: [
      {
        question: 'Kann ich meine Buchung stornieren?',
        answer: (
          <>
            Ja, nach folgender Staffelung: Mehr als 7 Tage vor Mietbeginn ist die Stornierung
            kostenlos. 3–6 Tage vorher fällt eine Stornogebühr von 50 % an. Weniger als 2 Tage
            vorher oder bei Nichtabholung wird der volle Mietpreis berechnet. Details findest du
            in unseren{' '}
            <Link href="/stornierung" className="text-accent-blue hover:underline font-medium">
              Stornierungsbedingungen
            </Link>
            .
          </>
        ),
      },
    ],
  },
  {
    title: 'Schäden & Haftung',
    color: 'emerald',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    items: [
      {
        question: 'Was passiert bei einem Schaden?',
        answer:
          'Normaler Verschleiß ist kein Problem. Bei Beschädigungen wird die Kaution je nach Schwere teilweise oder vollständig einbehalten. Du wirst vorab per E-Mail über den Schadensbetrag informiert. Schäden bitte immer sofort melden.',
      },
      {
        question: 'Gibt es einen Haftungsschutz?',
        answer: (
          <>
            Ja! Bei der Buchung kannst du zwischen Standard-Haftung (max. 150 € Selbstbeteiligung)
            und Premium-Haftung (keine Selbstbeteiligung) wählen. Ohne gewählte Haftungsoption
            haftest du für den vollen Wiederbeschaffungswert. Es handelt sich dabei nicht um eine
            Versicherung, sondern um eine Haftungsbegrenzung. Details findest du in unseren{' '}
            <Link href="/haftungsbedingungen" className="text-accent-blue hover:underline font-medium">Haftungsbedingungen</Link>.
          </>
        ),
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Accordion-Item                                                     */
/* ------------------------------------------------------------------ */

function AccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-brand-border/60 dark:border-white/10 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-4 px-1 text-left group"
        aria-expanded={isOpen}
      >
        <span className="font-heading font-semibold text-[15px] text-brand-black dark:text-white group-hover:text-accent-blue dark:group-hover:text-accent-blue transition-colors">
          {item.question}
        </span>
        <span
          className={`flex-shrink-0 w-8 h-8 rounded-full bg-brand-bg dark:bg-white/5 flex items-center justify-center transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-4 h-4 text-brand-steel dark:text-gray-400"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isOpen ? 'max-h-[500px] opacity-100 pb-4' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="font-body text-brand-steel dark:text-gray-300 text-sm leading-relaxed px-1">
          {item.answer}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Seite                                                              */
/* ------------------------------------------------------------------ */

export default function FaqContent() {
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  function toggle(key: string) {
    setOpenItem((prev) => prev === key ? null : key);
  }

  /* Suche: nur plaintext-Teile der Fragen durchsuchen */
  const filteredSections = faqSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.question.toLowerCase().includes(search.toLowerCase()),
      ),
    }))
    .filter((section) => section.items.length > 0);

  const totalQuestions = faqSections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="bg-brand-black dark:bg-gray-950 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading font-bold text-4xl sm:text-5xl mb-4">
            Häufige Fragen
          </h1>
          <p className="font-body text-lg text-gray-300 max-w-2xl mx-auto mb-8">
            Antworten auf die wichtigsten Fragen rund um Buchung, Versand, Rückgabe und mehr.
          </p>

          {/* Suchfeld */}
          <div className="max-w-md mx-auto relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Frage suchen…"
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-gray-400 font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/50 focus:border-accent-blue/50 transition-colors"
            />
          </div>
        </div>
      </section>

      {/* Kategorien-Nav */}
      <section className="bg-white dark:bg-gray-900 border-b border-brand-border/60 dark:border-white/10 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            {faqSections.map((section) => {
              const colors = colorConfig[section.color];
              return (
                <a
                  key={section.title}
                  href={`#${section.title.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'und')}`}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-body font-medium border transition-colors ${colors.bg} ${colors.text} ${colors.border} hover:opacity-80`}
                >
                  {section.icon}
                  <span className="whitespace-nowrap">{section.title}</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ-Sektionen */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {search && filteredSections.length === 0 && (
            <div className="text-center py-12">
              <p className="font-body text-brand-steel dark:text-gray-400 text-lg">
                Keine Fragen gefunden für &ldquo;{search}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="mt-3 font-body text-accent-blue hover:underline text-sm"
              >
                Suche zurücksetzen
              </button>
            </div>
          )}

          <div className="space-y-12">
            {filteredSections.map((section) => {
              const colors = colorConfig[section.color];
              return (
                <div
                  key={section.title}
                  id={section.title.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'und')}
                  className="scroll-mt-20"
                >
                  {/* Sektion-Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className={`w-10 h-10 rounded-xl ${colors.bg} ${colors.text} flex items-center justify-center`}
                    >
                      {section.icon}
                    </div>
                    <div>
                      <h2 className="font-heading font-semibold text-xl text-brand-black dark:text-white">
                        {section.title}
                      </h2>
                      <p className="font-body text-xs text-brand-muted dark:text-gray-500">
                        {section.items.length} {section.items.length === 1 ? 'Frage' : 'Fragen'}
                      </p>
                    </div>
                  </div>

                  {/* Accordion */}
                  <div className="bg-brand-bg/50 dark:bg-white/[0.03] rounded-2xl border border-brand-border/40 dark:border-white/5 px-5 sm:px-6">
                    {section.items.map((item) => {
                      const key = `${section.title}::${item.question}`;
                      return (
                        <AccordionItem
                          key={key}
                          item={item}
                          isOpen={openItem === key}
                          onToggle={() => toggle(key)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Statistik-Leiste */}
      <section className="py-10 bg-gray-50 dark:bg-gray-800/50 border-y border-brand-border/40 dark:border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-heading font-bold text-2xl text-brand-black dark:text-white">{totalQuestions}</p>
              <p className="font-body text-xs text-brand-muted dark:text-gray-500">Antworten</p>
            </div>
            <div>
              <p className="font-heading font-bold text-2xl text-brand-black dark:text-white">{faqSections.length}</p>
              <p className="font-body text-xs text-brand-muted dark:text-gray-500">Kategorien</p>
            </div>
            <div>
              <p className="font-heading font-bold text-2xl text-brand-black dark:text-white">24h</p>
              <p className="font-body text-xs text-brand-muted dark:text-gray-500">Antwortzeit</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-white mb-4">
            Deine Frage war nicht dabei?
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-400 mb-8">
            Schreib uns gerne — wir antworten in der Regel innerhalb von 24 Stunden.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/kontakt"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold hover:opacity-90 transition-colors"
            >
              Kontakt aufnehmen
            </Link>
            <Link
              href="/kameras"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg border-2 border-brand-black dark:border-white/20 text-brand-black dark:text-white font-heading font-semibold hover:bg-brand-bg dark:hover:bg-white/5 transition-colors"
            >
              Kameras ansehen
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

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
  color: 'blue' | 'teal' | 'amber' | 'rose' | 'violet' | 'emerald' | 'pink';
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
  pink: {
    bg: 'bg-pink-50 dark:bg-pink-500/15',
    text: 'text-pink-500',
    border: 'border-pink-200',
    ring: 'ring-pink-500/20',
    dot: 'bg-pink-500',
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
          'Nein, es gibt keine Mindestmietdauer. Du kannst eine Kamera ab einem Tag mieten. Je länger die Mietdauer, desto günstiger wird der Tagespreis — längere Mietzeiträume werden automatisch günstiger.',
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
            <span className="block"><strong>1. Versand</strong> — Wähle, ob du die Ausrüstung per DHL/DPD geliefert bekommen oder selbst abholen möchtest.</span>
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
        question: 'Muss ich einen Mietvertrag unterschreiben?',
        answer:
          'Ja. Zu jeder Buchung gehört ein Mietvertrag, den du digital direkt im Buchungsprozess unterschreibst (bei Selbstabholung alternativ vor Ort). Erst mit deiner Unterschrift ist die Buchung vollständig. Den unterschriebenen Vertrag erhältst du als PDF und findest ihn jederzeit in deinem Kundenkonto.',
      },
      {
        question: 'Muss ich meinen Ausweis hochladen?',
        answer: (
          <>
            Als Neukunde lädst du nach der Buchung einmalig deinen Ausweis (Vorder- und
            Rückseite) in deinem{' '}
            <Link href="/konto/verifizierung" className="text-accent-blue hover:underline font-medium">Kundenkonto</Link>{' '}
            hoch. Wir prüfen ihn vor dem Versand — die Kamera wird erst verschickt,
            sobald die Verifizierung abgeschlossen ist. Das dient dem Schutz vor Missbrauch
            und ist nur beim ersten Mal nötig.
          </>
        ),
      },
      {
        question: 'Welches Zubehör kann ich dazubuchen?',
        answer:
          'Im Buchungsschritt „Zubehör" kannst du passendes Zubehör wie Speicherkarten, Akkus, Stative oder Halterungen dazubuchen. Für viele Kameras gibt es außerdem fertige Sets, die beliebtes Zubehör zum günstigen Paketpreis bündeln. Es wird immer nur Zubehör angezeigt, das zu deiner gewählten Kamera passt.',
      },
      {
        question: 'Was ist, wenn meine Wunschkamera nicht verfügbar ist?',
        answer:
          'Für Kameras, die noch nicht im Bestand sind, erscheint statt „Jetzt mieten" ein „Benachrichtige mich"-Feld. Trag dort einfach deine E-Mail-Adresse ein — wir melden uns bei dir, sobald die Kamera buchbar ist.',
      },
      {
        question: 'Kann ich mehrere Kameras gleichzeitig mieten?',
        answer:
          'Ja. Du kannst mehrere Kameras — auch verschiedene Modelle — in den Warenkorb legen und in einer Buchung mieten. Die Verfügbarkeit wird für jedes Modell einzeln im Kalender geprüft.',
      },
      {
        question: 'Kann ich meine Buchung auf einen anderen Termin verlegen?',
        answer: (
          <>
            Ja. Eine bestätigte Buchung kannst du über dein{' '}
            <Link href="/konto/buchungen" className="text-accent-blue hover:underline font-medium">Kundenkonto</Link>{' '}
            einmalig kostenlos auf einen anderen Termin verlegen (Button „Verlegen“) — solange die
            Miete noch nicht unmittelbar bevorsteht (bis spätestens einen Tag vor dem Versand- bzw.
            Abholtag). Mietdauer und Preis bleiben gleich, eine erneute Zahlung fällt nicht an. Du
            unterschreibst dabei kurz den Mietvertrag für den neuen Zeitraum neu. Wichtig: Eine
            Verlegung eröffnet deine kostenlose Stornofrist nicht neu.
          </>
        ),
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
          'Wir versenden mit DHL oder DPD. Der Standardversand dauert in der Regel 3–5 Werktage, Express wird innerhalb von 24 Stunden an Werktagen verschickt. Die Ausrüstung geht üblicherweise einen Werktag vor Mietbeginn raus. Ab 50 € Bestellwert ist der Standardversand kostenlos.',
      },
      {
        question: 'Kann ich die Ausrüstung auch abholen?',
        answer:
          `Ja! Selbstabholung ist in ${BUSINESS.pickupLocation} kostenlos möglich. Die Abholung erfolgt in der Regel einen Tag vor Mietbeginn. Den genauen Termin vereinbarst du bei der Buchung.`,
      },
      {
        question: 'Liefert ihr auch ins Ausland?',
        answer:
          'Aktuell versenden wir ausschließlich innerhalb Deutschlands. Bei der Registrierung und im Checkout ist daher nur eine deutsche Lieferadresse möglich. Selbstabholung vor Ort ist natürlich ebenfalls möglich.',
      },
      {
        question: 'Kann ich mein Paket verfolgen?',
        answer: (
          <>
            Ja. Sobald dein Paket rausgeht, erhältst du eine Versandbestätigung per E-Mail mit einem
            Tracking-Link (DHL oder DPD). Die Sendungsnummer findest du außerdem jederzeit in deinem{' '}
            <Link href="/konto/buchungen" className="text-accent-blue hover:underline font-medium">Kundenkonto</Link>.
          </>
        ),
      },
      {
        question: 'Kann ich eine abweichende Liefer- oder Rechnungsadresse angeben?',
        answer: (
          <>
            Ja. In deinem{' '}
            <Link href="/konto/uebersicht" className="text-accent-blue hover:underline font-medium">Kundenkonto</Link>{' '}
            kannst du eine abweichende Liefer- und/oder Rechnungsadresse als Standard hinterlegen.
            Alternativ gibst du im Warenkorb-Checkout pro Buchung eine abweichende Adresse an — zum
            Beispiel, wenn die Rechnung an deine Firma gehen soll.
          </>
        ),
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
            das beigelegte Rücksende-Etikett. Falls du es nicht mehr hast, kannst du es in
            deinem{' '}
            <Link href="/konto/buchungen" className="text-accent-blue hover:underline font-medium">Kundenkonto</Link>{' '}
            herunterladen. Die Rücksendung muss spätestens am Tag nach Mietende beim Paketdienst
            abgegeben werden.
          </>
        ),
      },
      {
        question: 'Was passiert bei verspäteter Rückgabe?',
        answer:
          'Für jeden zusätzlichen Tag wird der reguläre Tagespreis berechnet. Bei erheblicher Verspätung (mehr als 3 Tage ohne Rückmeldung) behalten wir uns die Berechnung des entstandenen Ausfalls sowie weitere Schritte vor. Melde dich einfach kurz bei uns, falls es zeitlich eng wird.',
      },
      {
        question: 'Ist eine Speicherkarte dabei und was passiert mit meinen Aufnahmen?',
        answer:
          'Bei vielen Sets ist eine Speicherkarte enthalten, ansonsten kannst du sie im Buchungsschritt „Zubehör" dazubuchen. Bitte sichere deine Fotos und Videos vor der Rückgabe und setze die Speicherkarte anschließend zurück — so sind deine Aufnahmen gelöscht, bevor die Karte weiterzieht.',
      },
      {
        question: 'Woher weiß ich, dass meine Rückgabe angekommen ist?',
        answer:
          'Sobald deine Rücksendung bei uns eingegangen und geprüft ist, erhältst du eine Abschluss-Bestätigung per E-Mail. Ist alles in Ordnung, ist deine Miete damit abgeschlossen.',
      },
    ],
  },
  {
    title: 'Zahlung',
    color: 'violet',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    items: [
      {
        question: 'Muss ich eine Kaution hinterlegen?',
        answer: (
          <>
            Nein. cam2rent verlangt keine klassische Kaution und reserviert keinen Betrag
            auf deiner Kreditkarte. Stattdessen wählst du bei der Buchung einen
            Haftungsschutz (Standard oder Premium), der deine Haftung im Schadensfall
            begrenzt. Mehr dazu findest du unter{' '}
            <a href="#schäden-und-haftung" className="text-accent-blue hover:underline font-medium">Schäden &amp; Haftung</a>.
          </>
        ),
      },
      {
        question: 'Welche Zahlungsmethoden gibt es?',
        answer:
          'Wir akzeptieren Visa, Mastercard, Klarna, Apple Pay, Google Pay und SEPA-Lastschrift. Die Bezahlung erfolgt sicher über Stripe. Barzahlung ist nicht möglich.',
      },
      {
        question: 'Kann ich einen Gutschein oder Rabatt einlösen?',
        answer:
          'Ja. Einen Gutscheincode gibst du im Checkout ein — der Rabatt wird sofort abgezogen. Zusätzlich greifen automatische Rabatte: Längere Mietzeiträume werden günstiger, und je nach Aktion können auch Mengen-, Frühbucher- oder Treuerabatte automatisch berücksichtigt werden.',
      },
      {
        question: 'Wann muss ich bezahlen?',
        answer:
          'Die Bezahlung erfolgt direkt im Checkout — mit der Zahlung ist deine Buchung verbindlich. Auch als Neukunde zahlst du sofort; deinen Ausweis lädst du danach hoch, wir prüfen ihn noch vor dem Versand.',
      },
    ],
  },
  {
    title: 'Stornierung & Widerruf',
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
            Ja, nach folgender Staffelung: 7 Tage oder mehr vor Mietbeginn ist die Stornierung
            kostenlos (volle Erstattung). 3 bis 7 Tage vorher fällt eine Stornogebühr von 50 % an
            (50 % Rückerstattung, Stornierung dann nur per E-Mail). Weniger als 3 Tage vorher fällt
            eine Stornogebühr von 90 % an (10 % Rückerstattung). Details findest du in unseren{' '}
            <Link href="/stornierung" className="text-accent-blue hover:underline font-medium">
              Stornierungsbedingungen
            </Link>
            .
          </>
        ),
      },
      {
        question: 'Habe ich ein Widerrufsrecht?',
        answer: (
          <>
            Als Verbraucher hast du grundsätzlich ein 14-tägiges Widerrufsrecht. Beginnt deine
            Miete jedoch schon vor Ablauf dieser Frist, bestätigst du im Checkout ausdrücklich,
            dass wir vorzeitig mit der Leistung beginnen dürfen — dein Widerrufsrecht erlischt
            dann mit vollständiger Vertragserfüllung (§ 356 Abs. 4 BGB). Alle Details findest du
            in unserer{' '}
            <Link href="/widerruf" className="text-accent-blue hover:underline font-medium">
              Widerrufsbelehrung
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
          'Normaler Verschleiß ist kein Problem. Bei Beschädigungen haftest du im Rahmen deines gewählten Haftungsschutzes — höchstens bis zum jeweiligen Höchstbetrag der Ersatzpflicht, ohne gewählten Haftungsschutz bis zum Wiederbeschaffungswert. Du wirst vorab per E-Mail über den Schadensbetrag informiert. Schäden bitte immer sofort melden.',
      },
      {
        question: 'Gibt es einen Haftungsschutz?',
        answer: (
          <>
            Ja! Bei der Buchung kannst du zwischen Basis-Haftungsschutz (Höchstbetrag der
            Ersatzpflicht max. 200 €, bei 360°-Kameras 300 €) und Premium-Haftungsschutz
            (Höchstbetrag der Ersatzpflicht 0 €) wählen. Ohne
            gewählten Haftungsschutz haftest du für den vollen Wiederbeschaffungswert. Es handelt
            sich dabei nicht um eine Versicherung, sondern um eine Haftungsbegrenzung. Details
            findest du in unseren{' '}
            <Link href="/haftungsbedingungen" className="text-accent-blue hover:underline font-medium">Haftungsbedingungen</Link>.
            <span className="block mt-2">
              Tipp: Manche private Haftpflichtversicherungen übernehmen Schäden an gemieteten
              Gegenständen (sogenannte Mietsachschäden). Es lohnt sich, das vor Mietbeginn bei
              deiner eigenen Versicherung zu erfragen.
            </span>
          </>
        ),
      },
    ],
  },
  {
    title: 'Extras & Vorteile',
    color: 'pink',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    items: [
      {
        question: 'Bekomme ich einen Rabatt, wenn ich meine Fotos oder Videos teile?',
        answer: (
          <>
            Ja! Nach deiner Miete kannst du in deinem{' '}
            <Link href="/konto/buchungen" className="text-accent-blue hover:underline font-medium">Kundenkonto</Link>{' '}
            Fotos oder Videos deiner Aufnahmen hochladen und uns die Nutzungsrechte erteilen. Nach
            unserer Freigabe erhältst du einen Rabattgutschein. Veröffentlichen wir dein Material auf
            unseren Kanälen, gibt es on top einen weiteren Bonus-Gutschein.
          </>
        ),
      },
      {
        question: 'Bekomme ich einen Gutschein fürs Bewerten?',
        answer:
          'Ja. Nach abgeschlossener Miete laden wir dich per E-Mail ein, uns bei Google zu bewerten — als Dankeschön bekommst du einen 10 %-Rabattgutschein für deine nächste Miete.',
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

import type { Metadata } from 'next';
import Link from 'next/link';
import { BUSINESS } from '@/lib/business-config';

export const metadata: Metadata = {
  title: 'FAQ – Häufige Fragen',
  description: 'Häufig gestellte Fragen rund um Buchung, Versand, Rückgabe, Kaution und Zahlung bei Cam2Rent.',
};

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

const faqSections: { title: string; items: FaqItem[] }[] = [
  {
    title: 'Buchung & Ablauf',
    items: [
      {
        question: 'Wie kann ich eine Kamera mieten?',
        answer: (
          <>
            Wähle die gewünschte Kamera auf unserer{' '}
            <Link href="/kameras" className="text-accent-blue hover:underline">Kamera-Seite</Link> aus,
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
            <Link href="/konto/buchungen" className="text-accent-blue hover:underline">Kundenkonto</Link>{' '}
            kannst du die Mietdauer verlängern, sofern die Kamera im Anschlusszeitraum verfügbar ist.
            Die Zusatzkosten werden automatisch berechnet und abgebucht.
          </>
        ),
      },
      {
        question: 'Wie läuft die Buchung Schritt für Schritt ab?',
        answer: (
          <>
            Die Buchung ist in 5 einfache Schritte aufgeteilt:{' '}
            <strong>1. Versand</strong> — Wähle, ob du die Ausrüstung per DHL geliefert bekommen oder selbst abholen möchtest. Wähle dein Wunschdatum im Kalender (grüne Tage = verfügbar).{' '}
            <strong>2. Zubehör</strong> — Optional kannst du passendes Zubehör wie Speicherkarten, Akkus oder Stative dazubuchen.{' '}
            <strong>3. Haftungsschutz</strong> — Entscheide dich für eine Haftungsoption: Standard (reduzierte Selbstbeteiligung) oder Premium (keine Selbstbeteiligung). So bist du im Schadensfall abgesichert.{' '}
            <strong>4. Zusammenfassung</strong> — Prüfe alle Details deiner Buchung: Zeitraum, Zubehör, Haftungsschutz und Gesamtpreis.{' '}
            <strong>5. Zahlung</strong> — Bezahle sicher über Stripe mit Kreditkarte, Klarna, Apple Pay, Google Pay oder SEPA-Lastschrift. Fertig! Du bekommst eine Bestätigung per E-Mail.
          </>
        ),
      },
    ],
  },
  {
    title: 'Versand & Abholung',
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
    items: [
      {
        question: 'Wie gebe ich die Ausrüstung zurück?',
        answer: (
          <>
            Packe die Ausrüstung vollständig zurück (Originalverpackung bevorzugt) und verwende
            das beigelegte DHL-Rücksende-Etikett. Falls du es nicht mehr hast, kannst du es in
            deinem{' '}
            <Link href="/konto/buchungen" className="text-accent-blue hover:underline">Kundenkonto</Link>{' '}
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
    items: [
      {
        question: 'Kann ich meine Buchung stornieren?',
        answer: (
          <>
            Ja, nach folgender Staffelung: Mehr als 7 Tage vor Mietbeginn ist die Stornierung
            kostenlos. 3–6 Tage vorher fällt eine Stornogebühr von 50 % an. Weniger als 2 Tage
            vorher oder bei Nichtabholung wird der volle Mietpreis berechnet. Details findest du
            in unseren{' '}
            <Link href="/stornierung" className="text-accent-blue hover:underline">
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
            <Link href="/haftungsbedingungen" className="text-accent-blue hover:underline">Haftungsbedingungen</Link>.
          </>
        ),
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black mb-2">
          Häufige Fragen (FAQ)
        </h1>
        <p className="text-sm font-body text-brand-muted mb-10">
          Antworten auf die wichtigsten Fragen rund um cam2rent
        </p>

        <div className="space-y-10">
          {faqSections.map((section) => (
            <section key={section.title}>
              <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.items.map((item) => (
                  <div key={item.question} className="bg-brand-bg rounded-card p-5">
                    <h3 className="font-heading font-semibold text-brand-black text-sm mb-2">
                      {item.question}
                    </h3>
                    <p className="font-body text-brand-steel text-sm leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 bg-accent-blue-soft rounded-card p-6 text-center">
          <p className="font-heading font-semibold text-brand-black mb-2">
            Deine Frage war nicht dabei?
          </p>
          <p className="font-body text-brand-steel text-sm mb-4">
            Schreib uns gerne — wir antworten in der Regel innerhalb von 24 Stunden.
          </p>
          <Link
            href="/kontakt"
            className="inline-block px-5 py-2.5 text-sm font-body font-semibold text-white bg-accent-blue rounded-btn hover:bg-accent-blue/90 transition-colors"
          >
            Kontakt aufnehmen
          </Link>
        </div>
      </div>
    </div>
  );
}

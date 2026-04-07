import type { Metadata } from 'next';
import { BUSINESS } from '@/lib/business-config';

export const metadata: Metadata = {
  title: 'Haftungsbedingungen',
  description: 'Haftungsbedingungen von Cam2Rent – Informationen zu Haftungsoptionen, Selbstbeteiligung und Schadensregelungen.',
};

export default function HaftungsbedingungenPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black dark:text-white mb-2">
          Haftungsbedingungen
        </h1>
        <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-10">Stand: Januar 2026</p>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 1 Geltungsbereich
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Diese Haftungsbedingungen gelten für alle Mietverträge über Kamera-, Audio- und
            Video-Ausrüstung, die über www.{BUSINESS.domain} gebucht werden. Sie werden mit der Auswahl
            und Bestätigung einer Haftungsoption Bestandteil des Mietvertrages.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 2 Haftungsoptionen
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300 mb-4">
            Bei jeder Buchung kann der Mieter zwischen folgenden Haftungsoptionen wählen:
          </p>
          <div className="space-y-3">
            <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5 border-l-4 border-brand-muted">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-semibold text-brand-black dark:text-white">Ohne Haftungsbegrenzung</h3>
                <span className="font-body font-semibold text-brand-black dark:text-white text-sm">0 €</span>
              </div>
              <p className="font-body text-brand-steel dark:text-gray-300 text-sm mb-2">
                Der Mieter haftet in voller Höhe des Wiederbeschaffungswerts der Ausrüstung.
              </p>
              <div className="inline-block bg-status-error/10 text-status-error text-xs font-body font-medium px-2 py-1 rounded">
                Volle Haftung
              </div>
            </div>

            <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5 border-l-4 border-accent-blue">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-semibold text-brand-black dark:text-white">Standard-Haftung</h3>
                <span className="font-body font-semibold text-accent-blue text-sm">15 € / Miete</span>
              </div>
              <p className="font-body text-brand-steel dark:text-gray-300 text-sm mb-2">
                Deckt Schäden bei sachgemäßer Nutzung ab (z.B. Sturz-, Stoß-, Wasser- oder
                Elektronikschäden). Selbstbeteiligung: maximal 150 € pro Schadensfall.
              </p>
              <div className="inline-block bg-accent-blue/10 text-accent-blue text-xs font-body font-medium px-2 py-1 rounded">
                Max. 150 € Selbstbeteiligung
              </div>
            </div>

            <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5 border-l-4 border-status-success">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-semibold text-brand-black dark:text-white">Premium-Haftung</h3>
                <span className="font-body font-semibold text-status-success text-sm">25 € / Miete</span>
              </div>
              <p className="font-body text-brand-steel dark:text-gray-300 text-sm mb-2">
                Vollschutz bei bestimmungsgemäßer Nutzung — keine Selbstbeteiligung im Schadensfall.
              </p>
              <div className="inline-block bg-status-success/10 text-status-success text-xs font-body font-medium px-2 py-1 rounded">
                Keine Selbstbeteiligung
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 3 Abgedeckte Schadensfälle
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300 mb-3">
            Bei Auswahl der Standard- oder Premium-Haftung sind folgende Schadensfälle abgedeckt:
          </p>
          <ul className="list-disc list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>Technische Defekte durch normale Nutzung</li>
            <li>Sturz- und Stoßschäden</li>
            <li>Wasserschäden (innerhalb der Spezifikationen bzw. mit korrektem Schutzgehäuse)</li>
            <li>Diebstahl (mit Polizeianzeige und Aktenzeichen)</li>
            <li>Verlust von Kleinzubehör bis zu einem Wert von 25 €</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 4 Ausschlüsse
          </h2>
          <div className="bg-accent-amber-soft border border-accent-amber/30 rounded-card p-4 mb-3">
            <p className="font-body text-brand-black dark:text-white font-medium text-sm">
              Kein Haftungsschutz besteht bei:
            </p>
          </div>
          <ul className="list-disc list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              <strong>Vorsatz oder grobe Fahrlässigkeit</strong> — In diesen Fällen haftet der
              Mieter unabhängig von der gewählten Option in voller Höhe.
            </li>
            <li>
              <strong>Unsachgemäße Nutzung</strong> — z.B. fehlende Schutzgehäuse,
              Überschreitung von Tiefengrenzen, Missachtung der Herstelleranweisungen.
            </li>
            <li>
              <strong>Verlust ohne Nachweis</strong> — Ohne polizeiliche Anzeige oder
              nachvollziehbare Dokumentation.
            </li>
            <li>
              <strong>Korrosion und Salzablagerungen</strong> — Wenn die Ausrüstung nach
              Salzwasserkontakt nicht ordnungsgemäß mit Süßwasser gespült wurde.
            </li>
            <li>
              <strong>Kosmetische Schäden</strong> — Kratzer und Abnutzung über den normalen
              Verschleiß hinaus.
            </li>
            <li>
              <strong>Eigenmächtige Reparaturen oder Modifikationen</strong> — Jede
              nicht autorisierte Veränderung an der Ausrüstung.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 5 Schadensmeldung
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Schäden müssen innerhalb von <strong>24 Stunden</strong> nach Auftreten gemeldet werden.
            </li>
            <li>
              Bei Diebstahl oder Verlust ist eine Polizeianzeige erforderlich. Das Aktenzeichen
              ist bei der Schadensmeldung anzugeben.
            </li>
            <li>
              Der Mieter muss auf Anfrage Fotos oder weitere Dokumentation des Schadens zur
              Verfügung stellen.
            </li>
          </ol>
          <p className="font-body text-brand-steel dark:text-gray-300 mt-3">
            Schadensmeldungen können über das{' '}
            <a href="/konto/reklamation" className="text-accent-blue hover:underline">
              Kundenkonto
            </a>{' '}
            oder per E-Mail an{' '}
            <a href={`mailto:${BUSINESS.emailKontakt}`} className="text-accent-blue hover:underline">
              {BUSINESS.emailKontakt}
            </a>{' '}
            eingereicht werden.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 6 Schadensabwicklung
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Nach Eingang der Schadensmeldung wird die Ausrüstung geprüft und die Schadenshöhe
              festgestellt.
            </li>
            <li>
              Der Mieter wird per E-Mail über das Ergebnis und die anfallenden Kosten informiert.
            </li>
            <li>
              Je nach gewählter Haftungsoption wird die Kaution teilweise oder vollständig
              einbehalten bzw. freigegeben.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 7 Schutzdauer
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Der Haftungsschutz beginnt mit der Übergabe (Lieferung/Abholung) der Ausrüstung und
            endet einen Kalendertag nach dem vereinbarten Mietende oder bei dokumentierter Rückgabe,
            je nachdem was zuerst eintritt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 8 Haftungsgrenzen — Zusammenfassung
          </h2>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b-2 border-brand-border dark:border-white/10">
                  <th className="text-left py-3 px-3 font-semibold text-brand-black dark:text-white">Option</th>
                  <th className="text-left py-3 px-3 font-semibold text-brand-black dark:text-white">Preis / Miete</th>
                  <th className="text-left py-3 px-3 font-semibold text-brand-black dark:text-white">Selbstbeteiligung</th>
                </tr>
              </thead>
              <tbody className="text-brand-steel dark:text-gray-300">
                <tr className="border-b border-brand-border dark:border-white/10/50">
                  <td className="py-3 px-3">Ohne Haftungsbegrenzung</td>
                  <td className="py-3 px-3">0 €</td>
                  <td className="py-3 px-3 text-status-error font-medium">Voller Wiederbeschaffungswert</td>
                </tr>
                <tr className="border-b border-brand-border dark:border-white/10/50">
                  <td className="py-3 px-3">Standard</td>
                  <td className="py-3 px-3">15 €</td>
                  <td className="py-3 px-3 text-accent-blue font-medium">Max. 150 €</td>
                </tr>
                <tr className="border-b border-brand-border dark:border-white/10/50">
                  <td className="py-3 px-3">Premium</td>
                  <td className="py-3 px-3">25 €</td>
                  <td className="py-3 px-3 text-status-success font-medium">Keine</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Kontakt
          </h2>
          <div className="font-body text-brand-steel dark:text-gray-300 space-y-1">
            <p className="font-semibold text-brand-black dark:text-white">{BUSINESS.name} – {BUSINESS.owner}</p>
            <p>{BUSINESS.fullAddress}</p>
            <p>
              E-Mail:{' '}
              <a href={`mailto:${BUSINESS.emailKontakt}`} className="text-accent-blue hover:underline">
                {BUSINESS.emailKontakt}
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

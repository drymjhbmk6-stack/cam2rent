import type { Metadata } from 'next';
import { BUSINESS } from '@/lib/business-config';

export const metadata: Metadata = {
  title: 'Impressum – Cam2Rent',
  description: 'Impressum und Anbieterangaben von Cam2Rent',
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black dark:text-white mb-2">Impressum</h1>
        <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-10">Angaben gemäß § 5 TMG</p>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">Anbieter</h2>
          <div className="font-body text-brand-steel dark:text-gray-300 space-y-1">
            <p className="font-semibold text-brand-black dark:text-white">{BUSINESS.legalName}</p>
            <p>{BUSINESS.owner}</p>
            <p>{BUSINESS.street}</p>
            <p>{BUSINESS.zip} {BUSINESS.city}</p>
            <p>{BUSINESS.country}</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">Kontakt</h2>
          <div className="font-body text-brand-steel dark:text-gray-300 space-y-1">
            <p>Telefon: {BUSINESS.phone}</p>
            <p>
              E-Mail:{' '}
              <a
                href={`mailto:${BUSINESS.emailKontakt}`}
                className="text-accent-blue hover:underline"
              >
                {BUSINESS.emailKontakt}
              </a>
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Umsatzsteuer
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            {BUSINESS.owner} ist Kleinunternehmer im Sinne von § 19 UStG. Es wird daher keine
            Umsatzsteuer berechnet und keine Umsatzsteuer-Identifikationsnummer ausgewiesen.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Streitschlichtung
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300 mb-3">
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS)
            bereit:{' '}
            <a
              href="https://ec.europa.eu/consumers/odr/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-blue hover:underline"
            >
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV
          </h2>
          <div className="font-body text-brand-steel dark:text-gray-300 space-y-1">
            <p>{BUSINESS.owner}</p>
            <p>{BUSINESS.street}</p>
            <p>{BUSINESS.zip} {BUSINESS.city}</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Haftung für Inhalte
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten
            nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als
            Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
            Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
            Tätigkeit hinweisen.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Haftung für Links
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
            Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr
            übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder
            Betreiber der Seiten verantwortlich.
          </p>
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">Urheberrecht</h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
            dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art
            der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen
            Zustimmung des jeweiligen Autors bzw. Erstellers.
          </p>
        </section>
      </div>
    </div>
  );
}

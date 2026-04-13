import type { Metadata } from 'next';
import Link from 'next/link';
import HowItWorks from '@/components/home/HowItWorks';
import SeasonalPageHeader from '@/components/SeasonalPageHeader';

export const metadata: Metadata = {
  title: "So funktioniert's | Cam2Rent",
  description:
    'In drei einfachen Schritten zur Action-Cam – Kamera auswählen, Zeitraum buchen, losfilmen. Schnell, unkompliziert und abgesichert.',
};

export default function SoFunktionierts() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <SeasonalPageHeader
        zone="so-funktionierts"
        title="So funktioniert's"
        subtitle="Action-Cam mieten in drei einfachen Schritten — ohne Kompliziertes, ohne Kleingedrucktes."
      />

      {/* Steps (wiederverwendete Komponente, ohne doppelte Überschrift) */}
      <HowItWorks hideHeader />

      {/* Detail-Abschnitte */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {/* Schritt 1 */}
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-accent-blue-soft text-accent-blue flex items-center justify-center">
              <span className="font-heading font-bold text-2xl">1</span>
            </div>
            <div>
              <h2 className="font-heading font-semibold text-2xl text-brand-black dark:text-gray-100 mb-3">
                Kamera auswählen
              </h2>
              <p className="font-body text-brand-steel dark:text-gray-400 leading-relaxed mb-4">
                Stöbere durch unser Sortiment an hochwertigen Action-Cams von
                GoPro, DJI und Insta360. Nutze unseren{' '}
                <a href="/kamera-finder" className="text-brand-orange hover:underline font-medium">
                  Kamera-Finder
                </a>{' '}
                um die perfekte Kamera für dein Abenteuer zu finden, oder
                vergleiche bis zu drei Kameras direkt miteinander.
              </p>
              <ul className="font-body text-sm text-brand-steel dark:text-gray-400 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
                  Premium Action-Cams zur Auswahl
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
                  Fertige Sets für Fahrrad, Ski, Tauchen &amp; mehr
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
                  Kamera-Vergleich &amp; Kamera-Finder inklusive
                </li>
              </ul>
            </div>
          </div>

          {/* Schritt 2 */}
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-accent-teal-soft text-accent-teal flex items-center justify-center">
              <span className="font-heading font-bold text-2xl">2</span>
            </div>
            <div>
              <h2 className="font-heading font-semibold text-2xl text-brand-black dark:text-gray-100 mb-3">
                Zeitraum buchen
              </h2>
              <p className="font-body text-brand-steel dark:text-gray-400 leading-relaxed mb-4">
                Wähle deinen Wunschzeitraum – ab einem Tag bis zu mehreren
                Wochen. Je länger du mietest, desto günstiger wird der
                Tagespreis. Bezahle sicher mit Stripe und wähle zwischen
                Standardversand und Expresslieferung.
              </p>
              <ul className="font-body text-sm text-brand-steel dark:text-gray-400 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-teal" />
                  Flexible Mietdauer ab 1 Tag
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-teal" />
                  Staffelpreise – länger mieten, mehr sparen
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-teal" />
                  Sichere Zahlung über Stripe
                </li>
              </ul>
            </div>
          </div>

          {/* Schritt 3 */}
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-accent-amber-soft text-accent-amber flex items-center justify-center">
              <span className="font-heading font-bold text-2xl">3</span>
            </div>
            <div>
              <h2 className="font-heading font-semibold text-2xl text-brand-black dark:text-gray-100 mb-3">
                Losfilmen!
              </h2>
              <p className="font-body text-brand-steel dark:text-gray-400 leading-relaxed mb-4">
                Deine Kamera kommt einsatzbereit bei dir an – aufgeladen und mit
                allem nötigen Zubehör. Nach deinem Abenteuer sendest du sie
                einfach mit dem beigelegten Rücksende-Label zurück.
              </p>
              <ul className="font-body text-sm text-brand-steel dark:text-gray-400 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
                  Kamera kommt einsatzbereit an
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
                  Optionaler Haftungsschutz für sorgenfreies Filmen
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
                  Kostenlose Rücksendung per Label
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100 mb-4">
            Bereit für dein nächstes Abenteuer?
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-400 mb-8">
            Finde jetzt die passende Action-Cam und buche in wenigen Minuten.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/kameras/"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-brand-orange text-white font-heading font-semibold hover:bg-brand-orange/90 transition-colors"
            >
              Kameras ansehen
            </Link>
            <a
              href="/kamera-finder"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg border-2 border-brand-orange text-brand-orange font-heading font-semibold hover:bg-brand-orange/10 transition-colors"
            >
              Kamera-Finder starten
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

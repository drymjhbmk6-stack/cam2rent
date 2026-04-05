import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: "So funktioniert's – Cam2Rent",
  description:
    'In nur 3 Schritten zur Action-Cam: Kamera auswählen, Zeitraum buchen, losfilmen. Erfahre wie einfach das Mieten bei Cam2Rent funktioniert.',
};

/* ------------------------------------------------------------------ */
/*  Daten                                                              */
/* ------------------------------------------------------------------ */

const steps = [
  {
    number: '1',
    title: 'Kamera auswählen',
    color: 'blue' as const,
    summary:
      'Stöbere durch unser Sortiment an hochwertigen Action-Cams und finde die perfekte Kamera für dein Abenteuer.',
    details: [
      'Vergleiche bis zu 3 Kameras direkt nebeneinander',
      'Nutze den Kamera-Finder für eine persönliche Empfehlung',
      'Prüfe die Verfügbarkeit im Live-Kalender (grün = verfügbar)',
      'Wähle optionales Zubehör wie Stative, SD-Karten oder Extra-Akkus',
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-8 h-8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
      </svg>
    ),
    cta: { href: '/kameras', label: 'Kameras entdecken' },
  },
  {
    number: '2',
    title: 'Zeitraum buchen',
    color: 'teal' as const,
    summary:
      'Wähle deinen Wunschzeitraum, entscheide dich für Versand oder Abholung und bezahle sicher online.',
    details: [
      'Flexible Mietdauer — ab 1 Tag, kein Minimum',
      'Längere Mietdauer = günstigerer Tagespreis',
      'Sichere Zahlung per Kreditkarte, Klarna, Apple Pay u.v.m.',
      'Optionaler Haftungsschutz für sorgenfreies Filmen',
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-8 h-8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    cta: { href: '/kamera-finder', label: 'Kamera-Finder starten' },
  },
  {
    number: '3',
    title: 'Losfilmen!',
    color: 'amber' as const,
    summary:
      'Die Kamera kommt einsatzbereit zu dir. Film dein Abenteuer, sende sie zurück — wir erledigen den Rest.',
    details: [
      'Versand 1 Werktag vor Mietbeginn per DHL',
      'Kamera kommt vollgeladen und einsatzbereit',
      'Kostenloser Rückversand mit beigelegtem Etikett',
      'Kaution wird nach Zustandsprüfung sofort freigegeben',
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-8 h-8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
    cta: null,
  },
];

const colorConfig = {
  blue: {
    bg: 'bg-accent-blue-soft dark:bg-accent-blue/10',
    text: 'text-accent-blue',
    number: 'bg-accent-blue text-white',
    bullet: 'text-accent-blue',
    border: 'border-accent-blue/20',
  },
  teal: {
    bg: 'bg-accent-teal-soft dark:bg-accent-teal/10',
    text: 'text-accent-teal',
    number: 'bg-accent-teal text-white',
    bullet: 'text-accent-teal',
    border: 'border-accent-teal/20',
  },
  amber: {
    bg: 'bg-accent-amber-soft dark:bg-accent-amber/10',
    text: 'text-accent-amber',
    number: 'bg-accent-amber text-white',
    bullet: 'text-accent-amber',
    border: 'border-accent-amber/20',
  },
};

const extras = [
  {
    title: 'Versand & Abholung',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25m-2.25 0h-2.735a2.25 2.25 0 00-2.122 1.5L5.25 14.25" />
      </svg>
    ),
    items: [
      'DHL Standardversand (2–3 Werktage) — ab 49 € kostenlos',
      'DHL Express (nächster Werktag) — 12,99 €',
      'Selbstabholung in Berlin (Alt-Buckow) — kostenlos',
    ],
  },
  {
    title: 'Haftungsschutz',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    items: [
      'Standard-Haftungsschutz (15 €) — max. 150 € Selbstbeteiligung',
      'Premium-Haftungsschutz (25 €) — keine Selbstbeteiligung',
      'Ohne Haftungsschutz haftest du für den vollen Wiederbeschaffungswert',
    ],
  },
  {
    title: 'Zahlung & Kaution',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    items: [
      'Visa, Mastercard, Klarna, Apple Pay, Google Pay, SEPA',
      'Kaution wird nur auf der Karte reserviert, nicht abgebucht',
      'Freigabe der Kaution nach Zustandsprüfung (i.d.R. am selben Tag)',
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Seite                                                              */
/* ------------------------------------------------------------------ */

export default function SoFunktioniertsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Hero */}
      <section className="bg-brand-bg dark:bg-gray-800/50 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-brand-black dark:text-gray-100 mb-4">
            So funktioniert&apos;s
          </h1>
          <p className="font-body text-brand-steel dark:text-gray-400 text-lg max-w-2xl mx-auto">
            In drei einfachen Schritten zur Action-Cam — schnell, unkompliziert und abgesichert.
            Kein Kleingedrucktes, keine versteckten Kosten.
          </p>
        </div>
      </section>

      {/* Schritte */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="space-y-12 md:space-y-16">
          {steps.map((step, idx) => {
            const colors = colorConfig[step.color];
            const isReversed = idx % 2 !== 0;

            return (
              <div
                key={step.number}
                className={`flex flex-col ${isReversed ? 'md:flex-row-reverse' : 'md:flex-row'} items-start gap-8 md:gap-12`}
              >
                {/* Icon-Block */}
                <div className="flex-shrink-0 mx-auto md:mx-0">
                  <div className="relative">
                    <div
                      className={`w-24 h-24 rounded-2xl ${colors.bg} ${colors.text} flex items-center justify-center`}
                    >
                      {step.icon}
                    </div>
                    <span
                      className={`absolute -top-2 -right-2 w-8 h-8 rounded-full ${colors.number} font-heading font-bold text-sm flex items-center justify-center shadow-md`}
                    >
                      {step.number}
                    </span>
                  </div>
                </div>

                {/* Text-Block */}
                <div className="flex-1">
                  <h2 className="font-heading font-bold text-2xl text-brand-black dark:text-gray-100 mb-3">
                    {step.title}
                  </h2>
                  <p className="font-body text-brand-steel dark:text-gray-400 leading-relaxed mb-5">
                    {step.summary}
                  </p>
                  <ul className="space-y-2.5 mb-5">
                    {step.details.map((d) => (
                      <li key={d} className="flex items-start gap-2.5">
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${colors.bullet}`}
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="font-body text-sm text-brand-steel dark:text-gray-400 leading-relaxed">
                          {d}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {step.cta && (
                    <Link
                      href={step.cta.href}
                      className={`inline-flex items-center gap-1.5 text-sm font-body font-semibold ${colors.text} hover:underline`}
                    >
                      {step.cta.label}
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                        <path
                          fillRule="evenodd"
                          d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Gut zu wissen */}
      <section className="bg-brand-bg dark:bg-gray-800/50 py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100 mb-10 text-center">
            Gut zu wissen
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {extras.map((extra) => (
              <div
                key={extra.title}
                className="bg-white dark:bg-gray-800 rounded-card p-6 shadow-card"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-accent-blue">{extra.icon}</div>
                  <h3 className="font-heading font-semibold text-brand-black dark:text-gray-100">
                    {extra.title}
                  </h3>
                </div>
                <ul className="space-y-2">
                  {extra.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="text-accent-blue mt-1.5 flex-shrink-0">
                        <svg viewBox="0 0 6 6" fill="currentColor" className="w-1.5 h-1.5" aria-hidden="true">
                          <circle cx="3" cy="3" r="3" />
                        </svg>
                      </span>
                      <span className="font-body text-sm text-brand-steel dark:text-gray-400 leading-relaxed">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100 mb-4">
            Bereit für dein nächstes Abenteuer?
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-400 mb-8 max-w-xl mx-auto">
            Finde jetzt die passende Action-Cam und buche in wenigen Minuten — flexibel, sicher und unkompliziert.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/kameras"
              className="px-6 py-3 text-sm font-body font-semibold text-white bg-accent-blue rounded-btn hover:bg-accent-blue/90 transition-colors"
            >
              Kameras entdecken
            </Link>
            <Link
              href="/faq"
              className="px-6 py-3 text-sm font-body font-semibold text-brand-steel dark:text-gray-400 bg-brand-bg dark:bg-gray-800 rounded-btn hover:bg-brand-border dark:hover:bg-gray-700 transition-colors"
            >
              Noch Fragen? Zum FAQ
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

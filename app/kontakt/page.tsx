import type { Metadata } from 'next';
import Link from 'next/link';
import { BUSINESS } from '@/lib/business-config';

export const metadata: Metadata = {
  title: 'Kontakt',
  description: 'Kontaktiere Cam2Rent – E-Mail, Telefon und Kontaktformular für Fragen zu Buchungen und Ausrüstung.',
};

export default function KontaktPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black dark:text-white mb-2">Kontakt</h1>
        <p className="text-sm font-body text-brand-muted dark:text-gray-500 mb-10">
          Wir antworten in der Regel innerhalb von 24 Stunden. Bei laufenden Buchungen bitte als
          dringend kennzeichnen.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl">📧</span>
              <h2 className="font-heading font-semibold text-brand-black dark:text-white">E-Mail</h2>
            </div>
            <a
              href={`mailto:${BUSINESS.emailKontakt}`}
              className="font-body text-accent-blue hover:underline text-sm"
            >
              {BUSINESS.emailKontakt}
            </a>
            <p className="font-body text-brand-muted dark:text-gray-500 text-xs mt-1">
              Für Anfragen, Angebote und Verfügbarkeiten
            </p>
          </div>

          <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl">📞</span>
              <h2 className="font-heading font-semibold text-brand-black dark:text-white">Telefon</h2>
            </div>
            <a
              href={`tel:+${BUSINESS.phoneRaw}`}
              className="font-body text-accent-blue hover:underline text-sm"
            >
              {BUSINESS.phone}
            </a>
            <p className="font-body text-brand-muted dark:text-gray-500 text-xs mt-1">
              Mo–Fr: 10:00 – 17:00 Uhr · Bitte Bestellnummer bereithalten
            </p>
          </div>

          <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl">💬</span>
              <h2 className="font-heading font-semibold text-brand-black dark:text-white">WhatsApp</h2>
            </div>
            <a
              href={BUSINESS.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-accent-blue hover:underline text-sm"
            >
              Chat starten
            </a>
            <p className="font-body text-brand-muted dark:text-gray-500 text-xs mt-1">
              Antwort meist innerhalb weniger Stunden — auch am Wochenende
            </p>
          </div>
        </div>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Standort
          </h2>
          <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5">
            <div className="font-body text-brand-steel dark:text-gray-400 space-y-1">
              <p className="font-semibold text-brand-black dark:text-white">{BUSINESS.legalName} – {BUSINESS.owner}</p>
              <p>{BUSINESS.street}</p>
              <p>{BUSINESS.zip} {BUSINESS.city}</p>
              <p>{BUSINESS.country}</p>
            </div>
            <p className="font-body text-brand-muted dark:text-gray-500 text-xs mt-3">
              Abholung nach Terminvereinbarung möglich ({BUSINESS.pickupLocation})
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Erreichbarkeit
          </h2>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-brand-border dark:border-white/10">
                  <th className="text-left py-2 px-3 font-semibold text-brand-black dark:text-white">Tag</th>
                  <th className="text-left py-2 px-3 font-semibold text-brand-black dark:text-white">Zeiten</th>
                </tr>
              </thead>
              <tbody className="text-brand-steel dark:text-gray-400">
                <tr className="border-b border-brand-border/50 dark:border-white/5">
                  <td className="py-2 px-3">Montag – Freitag</td>
                  <td className="py-2 px-3">10:00 – 17:00 Uhr (Telefon, WhatsApp & E-Mail)</td>
                </tr>
                <tr className="border-b border-brand-border/50 dark:border-white/5">
                  <td className="py-2 px-3">Samstag & Sonntag</td>
                  <td className="py-2 px-3">Nur per WhatsApp & E-Mail</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Kontaktformular
          </h2>
          <ContactForm />
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Schnellzugriff
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { href: '/kameras', label: 'Shop & Angebote' },
              { href: '/konto/reklamation', label: 'Schadensmeldung' },
              { href: '/faq', label: 'FAQ' },
              { href: '/agb', label: 'AGB' },
              { href: '/versand-zahlung', label: 'Versandinfos' },
              { href: '/stornierung', label: 'Stornierung' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="bg-brand-bg dark:bg-brand-dark rounded-card p-3 text-center font-body text-sm text-brand-steel dark:text-gray-400 hover:text-accent-blue hover:bg-accent-blue-soft dark:hover:bg-accent-blue/10 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ContactForm() {
  return (
    <form
      action={`https://formsubmit.co/${BUSINESS.emailKontakt}`}
      method="POST"
      className="space-y-4"
    >
      <input type="hidden" name="_subject" value={`Neue Kontaktanfrage über ${BUSINESS.domain}`} />
      <input type="hidden" name="_captcha" value="false" />
      <input type="hidden" name="_next" value={`${BUSINESS.url}/kontakt?sent=true`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="block text-xs font-body font-medium text-brand-steel dark:text-gray-400 mb-1">
            Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            className="w-full px-3 py-2.5 text-sm font-body border border-brand-border dark:border-white/10 rounded-btn bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
            placeholder="Dein Name"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-xs font-body font-medium text-brand-steel dark:text-gray-400 mb-1">
            E-Mail *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="w-full px-3 py-2.5 text-sm font-body border border-brand-border dark:border-white/10 rounded-btn bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
            placeholder="deine@email.de"
          />
        </div>
      </div>

      <div>
        <label htmlFor="betreff" className="block text-xs font-body font-medium text-brand-steel dark:text-gray-400 mb-1">
          Betreff
        </label>
        <input
          type="text"
          id="betreff"
          name="betreff"
          className="w-full px-3 py-2.5 text-sm font-body border border-brand-border dark:border-white/10 rounded-btn bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
          placeholder="z.B. Frage zur Buchung BK-2026-..."
        />
      </div>

      <div>
        <label htmlFor="message" className="block text-xs font-body font-medium text-brand-steel dark:text-gray-400 mb-1">
          Nachricht *
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className="w-full px-3 py-2.5 text-sm font-body border border-brand-border dark:border-white/10 rounded-btn bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue resize-y"
          placeholder="Deine Nachricht..."
        />
      </div>

      <button
        type="submit"
        className="px-6 py-2.5 text-sm font-body font-semibold text-white bg-accent-blue rounded-btn hover:bg-accent-blue/90 transition-colors"
      >
        Nachricht senden
      </button>
    </form>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { BUSINESS } from '@/lib/business-config';

export const metadata: Metadata = {
  title: 'Versand & Zahlung',
  description: 'Informationen zu Versandoptionen, Lieferzeiten und Zahlungsmethoden bei Cam2Rent.',
};

export default function VersandZahlungPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black dark:text-white mb-2">Versand & Zahlung</h1>
        <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-10">
          Alles zu Lieferung, Rücksendung und Bezahlung
        </p>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Versandoptionen
          </h2>
          <div className="space-y-4">
            <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">📦</span>
                <h3 className="font-heading font-semibold text-brand-black dark:text-white">DHL Standardversand</h3>
              </div>
              <p className="font-body text-brand-steel dark:text-gray-300 text-sm">
                Lieferung innerhalb von 2–3 Werktagen. Die Ausrüstung wird in der Regel einen
                Werktag vor dem Mietbeginn versendet.
              </p>
            </div>
            <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">⚡</span>
                <h3 className="font-heading font-semibold text-brand-black dark:text-white">DHL Expressversand</h3>
              </div>
              <p className="font-body text-brand-steel dark:text-gray-300 text-sm">
                Lieferung am nächsten Werktag (bei Bestellung vor 14:00 Uhr). Gegen Aufpreis.
              </p>
            </div>
            <div className="bg-brand-bg dark:bg-brand-dark rounded-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">🏠</span>
                <h3 className="font-heading font-semibold text-brand-black dark:text-white">Selbstabholung</h3>
              </div>
              <p className="font-body text-brand-steel dark:text-gray-300 text-sm">
                Kostenlose Abholung in {BUSINESS.pickupLocation}. Die Abholung ist in der Regel einen Tag
                vor Mietbeginn möglich. Termin wird bei der Buchung vereinbart.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Versandkosten
          </h2>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-brand-border dark:border-white/10">
                  <th className="text-left py-3 px-3 font-semibold text-brand-black dark:text-white">Versandart</th>
                  <th className="text-left py-3 px-3 font-semibold text-brand-black dark:text-white">Kosten</th>
                </tr>
              </thead>
              <tbody className="text-brand-steel dark:text-gray-300">
                <tr className="border-b border-brand-border/50 dark:border-white/5">
                  <td className="py-3 px-3">DHL Standard</td>
                  <td className="py-3 px-3">Ab 49 € Bestellwert kostenlos, sonst lt. Preisliste</td>
                </tr>
                <tr className="border-b border-brand-border/50 dark:border-white/5">
                  <td className="py-3 px-3">DHL Express</td>
                  <td className="py-3 px-3">Aufpreis lt. Preisliste</td>
                </tr>
                <tr className="border-b border-brand-border/50 dark:border-white/5">
                  <td className="py-3 px-3">Selbstabholung</td>
                  <td className="py-3 px-3">Kostenlos</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="font-body text-brand-steel dark:text-gray-300 text-sm mt-3">
            Die genauen Versandkosten werden im Checkout vor der Buchung angezeigt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Rücksendung
          </h2>
          <ul className="list-disc list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Packen Sie die Ausrüstung vollständig zurück (Originalverpackung bevorzugt).
            </li>
            <li>
              Verwenden Sie das beigelegte DHL-Rücksende-Etikett oder laden Sie es in Ihrem{' '}
              <Link href="/konto/buchungen" className="text-accent-blue hover:underline">
                Kundenkonto
              </Link>{' '}
              herunter.
            </li>
            <li>
              Die Rücksendung muss spätestens am Tag nach Mietende bei DHL abgegeben werden.
            </li>
            <li>
              Bei verspäteter Rückgabe werden zusätzliche Miettage berechnet.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Tracking
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Nach dem Versand erhalten Sie per E-Mail eine Tracking-Nummer, mit der Sie die Lieferung
            jederzeit verfolgen können. Auch die Rücksendung ist über die Tracking-Nummer verfolgbar.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Zahlungsmethoden
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300 mb-4">
            Die Bezahlung erfolgt sicher über unseren Zahlungsdienstleister Stripe. Folgende
            Zahlungsmethoden werden akzeptiert:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { name: 'Visa', icon: '💳' },
              { name: 'Mastercard', icon: '💳' },
              { name: 'Klarna', icon: '🛒' },
              { name: 'Apple Pay', icon: '🍎' },
              { name: 'Google Pay', icon: '📱' },
              { name: 'SEPA-Lastschrift', icon: '🏦' },
            ].map((method) => (
              <div
                key={method.name}
                className="bg-brand-bg dark:bg-brand-dark rounded-card p-3 text-center font-body text-sm text-brand-steel dark:text-gray-300"
              >
                <span className="text-lg block mb-1">{method.icon}</span>
                {method.name}
              </div>
            ))}
          </div>
          <p className="font-body text-brand-steel dark:text-gray-300 text-sm mt-3">
            Barzahlung ist nicht möglich. Die Zahlung wird bei Buchungsabschluss vollständig
            abgewickelt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Kaution
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Bei jeder Buchung wird eine Kaution als Vorautorisierung auf Ihrer Kreditkarte blockiert
            (nicht abgebucht). Der Betrag richtet sich nach dem Wert der Ausrüstung und wird vor
            Abschluss der Buchung transparent angezeigt. Nach erfolgreicher Rückgabe wird die
            Vorautorisierung automatisch freigegeben. Weitere Details finden Sie in unseren{' '}
            <Link href="/stornierung" className="text-accent-blue hover:underline">
              Rückerstattungsbedingungen
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Preise
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Alle angegebenen Preise sind Endpreise. Gemäß § 19 UStG (Kleinunternehmerregelung)
            wird keine Umsatzsteuer erhoben und ausgewiesen.
          </p>
        </section>
      </div>
    </div>
  );
}

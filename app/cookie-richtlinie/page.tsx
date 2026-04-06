import type { Metadata } from 'next';
import Link from 'next/link';
import ResetConsentButton from '@/components/ResetConsentButton';
import { BUSINESS } from '@/lib/business-config';

export const metadata: Metadata = {
  title: 'Cookie-Richtlinie (EU)',
  description: 'Cookie-Richtlinie von Cam2Rent – Informationen zu Cookies und Tracking auf unserer Website.',
};

export default function CookieRichtliniePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black mb-2">
          Cookie-Richtlinie (EU)
        </h1>
        <p className="text-sm font-body text-brand-muted mb-10">
          Stand: April 2026 · Gilt für Bürger und ständige Einwohner der EU/des EWR
        </p>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            1. Verwendung von Cookies
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Unsere Website www.{BUSINESS.domain} setzt <strong>keine Tracking-Cookies</strong>. Wir
            verwenden ausschließlich technisch notwendige Speichermechanismen (Cookies und
            localStorage), die für den Betrieb der Website erforderlich sind.
          </p>
          <p className="font-body text-brand-steel">
            Im Gegensatz zu vielen anderen Websites setzen wir bewusst auf eine datenschutzfreundliche
            Lösung ohne Drittanbieter-Cookies.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            2. Technisch notwendige Speicherung
          </h2>
          <p className="font-body text-brand-steel mb-4">
            Folgende Daten werden lokal in Ihrem Browser gespeichert und sind für den Betrieb der
            Website erforderlich. Diese erfordern keine Einwilligung.
          </p>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Name</th>
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Typ</th>
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Zweck</th>
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Dauer</th>
                </tr>
              </thead>
              <tbody className="text-brand-steel">
                <tr className="border-b border-brand-border/50">
                  <td className="py-2 px-3"><code className="bg-brand-bg px-1 rounded text-xs">cam2rent_consent</code></td>
                  <td className="py-2 px-3">localStorage</td>
                  <td className="py-2 px-3">Speichert Ihre Cookie-Einstellung</td>
                  <td className="py-2 px-3">Dauerhaft</td>
                </tr>
                <tr className="border-b border-brand-border/50">
                  <td className="py-2 px-3"><code className="bg-brand-bg px-1 rounded text-xs">cam2rent_cart</code></td>
                  <td className="py-2 px-3">localStorage</td>
                  <td className="py-2 px-3">Warenkorb-Inhalt</td>
                  <td className="py-2 px-3">Dauerhaft</td>
                </tr>
                <tr className="border-b border-brand-border/50">
                  <td className="py-2 px-3"><code className="bg-brand-bg px-1 rounded text-xs">sb-*-auth-token</code></td>
                  <td className="py-2 px-3">Cookie</td>
                  <td className="py-2 px-3">Anmeldesitzung (Kundenkonto)</td>
                  <td className="py-2 px-3">Sitzung</td>
                </tr>
                <tr className="border-b border-brand-border/50">
                  <td className="py-2 px-3"><code className="bg-brand-bg px-1 rounded text-xs">admin_token</code></td>
                  <td className="py-2 px-3">Cookie</td>
                  <td className="py-2 px-3">Admin-Authentifizierung</td>
                  <td className="py-2 px-3">Sitzung</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            3. Zahlungsdienstleister (Stripe)
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Bei der Nutzung unseres Zahlungsdienstleisters Stripe werden folgende technisch
            notwendige Cookies für die sichere Zahlungsabwicklung und Betrugserkennung gesetzt:
          </p>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Name</th>
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Zweck</th>
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Dauer</th>
                </tr>
              </thead>
              <tbody className="text-brand-steel">
                <tr className="border-b border-brand-border/50">
                  <td className="py-2 px-3"><code className="bg-brand-bg px-1 rounded text-xs">__stripe_mid</code></td>
                  <td className="py-2 px-3">Betrugsprävention (Geräte-Identifikation)</td>
                  <td className="py-2 px-3">1 Jahr</td>
                </tr>
                <tr className="border-b border-brand-border/50">
                  <td className="py-2 px-3"><code className="bg-brand-bg px-1 rounded text-xs">__stripe_sid</code></td>
                  <td className="py-2 px-3">Sitzungsbasierte Betrugserkennung</td>
                  <td className="py-2 px-3">30 Minuten</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="font-body text-brand-steel mt-3 text-sm">
            Diese Cookies sind für die sichere Zahlungsabwicklung erforderlich und können nicht
            deaktiviert werden.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            4. Optionales Analyse-Tracking
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Mit Ihrer Einwilligung nutzen wir ein selbst gehostetes, cookieloses Analysesystem.
            Dabei werden folgende Daten im localStorage Ihres Browsers gespeichert:
          </p>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Name</th>
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Zweck</th>
                  <th className="text-left py-2 px-3 font-semibold text-brand-black">Dauer</th>
                </tr>
              </thead>
              <tbody className="text-brand-steel">
                <tr className="border-b border-brand-border/50">
                  <td className="py-2 px-3"><code className="bg-brand-bg px-1 rounded text-xs">cam2rent_vid</code></td>
                  <td className="py-2 px-3">Anonyme Besucher-ID (zufällige UUID)</td>
                  <td className="py-2 px-3">Dauerhaft</td>
                </tr>
                <tr className="border-b border-brand-border/50">
                  <td className="py-2 px-3"><code className="bg-brand-bg px-1 rounded text-xs">cam2rent_sid</code></td>
                  <td className="py-2 px-3">Session-ID (zufällige UUID)</td>
                  <td className="py-2 px-3">Browser-Sitzung</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="font-body text-brand-steel mt-3">
            Es werden keine persönlichen Daten erfasst und keine IP-Adressen gespeichert. Die
            erhobenen Daten werden ausschließlich auf unserem eigenen Server in Deutschland
            verarbeitet und nach 90 Tagen automatisch gelöscht.
          </p>
          <p className="font-body text-brand-steel mt-3">
            Sie können dieses Tracking jederzeit über den Cookie-Banner deaktivieren oder wieder
            aktivieren. Wählen Sie dazu &quot;Nur notwendige&quot; um das Tracking abzulehnen.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            5. Einstellungen verwalten
          </h2>
          <p className="font-body text-brand-steel mb-4">
            Sie können Ihre Einwilligung jederzeit widerrufen. Klicken Sie dazu auf den folgenden
            Button, um Ihre Einstellungen zurückzusetzen. Beim nächsten Seitenaufruf wird der
            Cookie-Banner erneut angezeigt.
          </p>
          <ResetConsentButton />
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            6. Ihre Rechte
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Im Rahmen der DSGVO haben Sie das Recht auf Auskunft, Berichtigung, Löschung,
            Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Weitere
            Informationen finden Sie in unserer{' '}
            <Link href="/datenschutz" className="text-accent-blue hover:underline">
              Datenschutzerklärung
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            7. Kontakt
          </h2>
          <div className="font-body text-brand-steel space-y-1">
            <p className="font-semibold text-brand-black">{BUSINESS.name} – {BUSINESS.owner}</p>
            <p>{BUSINESS.fullAddress}</p>
            <p>
              E-Mail:{' '}
              <a href={`mailto:${BUSINESS.emailKontakt}`} className="text-accent-blue hover:underline">
                {BUSINESS.emailKontakt}
              </a>
            </p>
            <p>Telefon: {BUSINESS.phone}</p>
          </div>
        </section>
      </div>
    </div>
  );
}


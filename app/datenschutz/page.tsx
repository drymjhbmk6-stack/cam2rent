import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  description: 'Datenschutzerklärung von Cam2Rent – Informationen zur Verarbeitung personenbezogener Daten.',
};

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black mb-2">Datenschutzerklärung</h1>
        <p className="text-sm font-body text-brand-muted mb-10">Stand: April 2026</p>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            1. Verantwortlicher
          </h2>
          <div className="font-body text-brand-steel space-y-1">
            <p className="font-semibold text-brand-black">Cam2Rent – Lennart Schickel</p>
            <p>Heimsbrunner Str. 12</p>
            <p>12349 Berlin, Deutschland</p>
            <p>
              E-Mail:{' '}
              <a href="mailto:kontakt@cam2rent.de" className="text-accent-blue hover:underline">
                kontakt@cam2rent.de
              </a>
            </p>
            <p>Telefon: 0162 / 8367477</p>
            <p>Website: www.cam2rent.de</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            2. Allgemeines zur Datenverarbeitung
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies zur
            Bereitstellung einer funktionsfähigen Website sowie unserer Inhalte und Leistungen
            erforderlich ist. Die Verarbeitung personenbezogener Daten unserer Nutzer erfolgt
            regelmäßig nur nach Einwilligung des Nutzers. Eine Ausnahme gilt in solchen Fällen, in
            denen eine vorherige Einholung einer Einwilligung aus tatsächlichen Gründen nicht möglich
            ist und die Verarbeitung der Daten durch gesetzliche Vorschriften gestattet ist.
          </p>
          <p className="font-body text-brand-steel">
            Rechtsgrundlagen für die Verarbeitung personenbezogener Daten sind insbesondere:
          </p>
          <ul className="list-disc list-inside font-body text-brand-steel mt-2 space-y-1">
            <li>Art. 6 Abs. 1 lit. a DSGVO – Einwilligung</li>
            <li>Art. 6 Abs. 1 lit. b DSGVO – Vertragserfüllung</li>
            <li>Art. 6 Abs. 1 lit. c DSGVO – Rechtliche Verpflichtung</li>
            <li>Art. 6 Abs. 1 lit. f DSGVO – Berechtigtes Interesse</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            3. Hosting
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Unsere Website wird auf einem Server der Hetzner Online GmbH (Industriestr. 25, 91710
            Gunzenhausen, Deutschland) gehostet. Hetzner ist ein deutscher Hosting-Anbieter und
            betreibt seine Rechenzentren ausschließlich in Deutschland und Finnland.
          </p>
          <p className="font-body text-brand-steel mb-3">
            Beim Besuch unserer Website werden automatisch Informationen in sogenannten
            Server-Log-Dateien gespeichert, die Ihr Browser automatisch übermittelt. Diese sind:
          </p>
          <ul className="list-disc list-inside font-body text-brand-steel space-y-1">
            <li>Browsertyp und Browserversion</li>
            <li>Verwendetes Betriebssystem</li>
            <li>Referrer URL (die zuvor besuchte Seite)</li>
            <li>Hostname des zugreifenden Rechners</li>
            <li>Datum und Uhrzeit der Serveranfrage</li>
          </ul>
          <p className="font-body text-brand-steel mt-3">
            Diese Daten werden nicht mit anderen Datenquellen zusammengeführt. Die Erfassung dieser
            Daten erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            4. Datenbank & Authentifizierung
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Wir nutzen Supabase (Supabase Inc., 970 Toa Payoh North #07-04, Singapore 318992) als
            Datenbank- und Authentifizierungsdienst. Supabase speichert die für die Nutzung unseres
            Dienstes erforderlichen Daten (z.B. Kundenkonto, Buchungsdaten) auf Servern in der EU
            (Frankfurt, Deutschland).
          </p>
          <p className="font-body text-brand-steel">
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) sowie Art. 6 Abs. 1
            lit. f DSGVO (berechtigtes Interesse an sicherem Betrieb).
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            5. Zahlungsabwicklung
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Für die Zahlungsabwicklung nutzen wir den Dienst Stripe (Stripe Payments Europe, Ltd.,
            1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Irland). Stripe verarbeitet
            die zur Durchführung der Zahlung erforderlichen Daten (Name, E-Mail-Adresse,
            Kreditkartendaten, Rechnungsbetrag) auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO.
          </p>
          <p className="font-body text-brand-steel mb-3">
            Stripe setzt zur Betrugserkennung und Absicherung des Zahlungsverkehrs technisch
            notwendige Cookies ein (z.B. <code className="bg-brand-bg px-1 rounded text-sm">__stripe_mid</code>,{' '}
            <code className="bg-brand-bg px-1 rounded text-sm">__stripe_sid</code>). Diese Cookies sind für
            die sichere Zahlungsabwicklung erforderlich und können nicht deaktiviert werden.
          </p>
          <p className="font-body text-brand-steel">
            Weitere Informationen finden Sie in der{' '}
            <a
              href="https://stripe.com/de/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-blue hover:underline"
            >
              Datenschutzerklärung von Stripe
            </a>
            .
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            6. E-Mail-Versand
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Für den Versand von Transaktions-E-Mails (Buchungsbestätigungen, Rechnungen, Stornierungen
            etc.) nutzen wir den Dienst Resend (Resend Inc., 2261 Market Street #4022, San Francisco, CA 94114, USA).
          </p>
          <p className="font-body text-brand-steel">
            Die Übermittlung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
            Es werden nur die für den E-Mail-Versand notwendigen Daten (E-Mail-Adresse, Name)
            übermittelt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            7. Versand
          </h2>
          <p className="font-body text-brand-steel">
            Zum Zweck der Zustellung der gemieteten Ausrüstung geben wir Ihre Lieferadresse und
            Kontaktdaten an den beauftragten Versanddienstleister (DHL / DPD) weiter. Dies erfolgt
            auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO. Die Versandetiketten werden über den Dienst
            SendCloud (SendCloud B.V., Insulindelaan 115, 5642 HA Eindhoven, Niederlande) erstellt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            8. Webanalyse (eigenes Tracking)
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Wir nutzen ein selbst gehostetes, cookieloses Analysesystem zur statistischen Auswertung
            der Websitenutzung. Dabei werden <strong>keine Cookies</strong> gesetzt und{' '}
            <strong>keine IP-Adressen</strong> gespeichert.
          </p>
          <p className="font-body text-brand-steel mb-3">Erfasst werden ausschließlich:</p>
          <ul className="list-disc list-inside font-body text-brand-steel space-y-1">
            <li>Besuchte Seite (URL-Pfad)</li>
            <li>Anonyme Besucher-ID (zufällig generiert, im Browser gespeichert via localStorage)</li>
            <li>Session-ID (zufällig generiert, pro Browser-Sitzung)</li>
            <li>Gerätetyp (Desktop/Mobil/Tablet), Browser und Betriebssystem</li>
            <li>Herkunftsseite (Referrer)</li>
            <li>UTM-Kampagnenparameter (falls vorhanden)</li>
          </ul>
          <p className="font-body text-brand-steel mt-3 mb-3">
            Alle Daten werden auf unserem eigenen Server in Deutschland gespeichert und nach 90 Tagen
            automatisch gelöscht. Eine Zuordnung zu einzelnen Personen ist nicht möglich.
          </p>
          <p className="font-body text-brand-steel">
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der
            statistischen Analyse des Nutzerverhaltens). Sie können dem Tracking jederzeit über
            unseren{' '}
            <Link href="/cookie-richtlinie" className="text-accent-blue hover:underline">
              Cookie-Banner
            </Link>{' '}
            widersprechen.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            9. Kundenkonto & Buchungsdaten
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Bei der Registrierung eines Kundenkontos und bei Buchungen erfassen wir folgende Daten:
          </p>
          <ul className="list-disc list-inside font-body text-brand-steel space-y-1">
            <li>Name, E-Mail-Adresse, Telefonnummer</li>
            <li>Lieferadresse</li>
            <li>Buchungsdetails (Produkt, Zeitraum, Preis)</li>
            <li>Zahlungsinformationen (werden direkt von Stripe verarbeitet)</li>
            <li>Ggf. Ausweisdokument zur Identitätsverifizierung</li>
          </ul>
          <p className="font-body text-brand-steel mt-3">
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Buchungsdaten werden
            gemäß den handels- und steuerrechtlichen Aufbewahrungsfristen (6 bzw. 10 Jahre) gespeichert.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            10. Ihre Rechte
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Sie haben gemäß DSGVO folgende Rechte bezüglich Ihrer personenbezogenen Daten:
          </p>
          <ul className="list-disc list-inside font-body text-brand-steel space-y-1">
            <li><strong>Auskunft</strong> (Art. 15 DSGVO) – Welche Daten wir über Sie gespeichert haben</li>
            <li><strong>Berichtigung</strong> (Art. 16 DSGVO) – Korrektur unrichtiger Daten</li>
            <li><strong>Löschung</strong> (Art. 17 DSGVO) – Löschung Ihrer Daten</li>
            <li><strong>Einschränkung der Verarbeitung</strong> (Art. 18 DSGVO)</li>
            <li><strong>Datenübertragbarkeit</strong> (Art. 20 DSGVO)</li>
            <li><strong>Widerspruch</strong> (Art. 21 DSGVO) – Gegen Verarbeitung auf Basis berechtigter Interessen</li>
            <li><strong>Widerruf der Einwilligung</strong> (Art. 7 Abs. 3 DSGVO) – Jederzeit möglich</li>
          </ul>
          <p className="font-body text-brand-steel mt-3">
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte an{' '}
            <a href="mailto:kontakt@cam2rent.de" className="text-accent-blue hover:underline">
              kontakt@cam2rent.de
            </a>
            .
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            11. Beschwerderecht bei der Aufsichtsbehörde
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Sie haben das Recht, sich bei der zuständigen Datenschutz-Aufsichtsbehörde zu beschweren:
          </p>
          <div className="font-body text-brand-steel space-y-1">
            <p className="font-semibold text-brand-black">Berliner Beauftragte für Datenschutz und Informationsfreiheit</p>
            <p>Friedrichstr. 219</p>
            <p>10969 Berlin</p>
            <p>
              Website:{' '}
              <a
                href="https://www.datenschutz-berlin.de"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-blue hover:underline"
              >
                www.datenschutz-berlin.de
              </a>
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            12. Datensicherheit
          </h2>
          <p className="font-body text-brand-steel">
            Unsere Website nutzt aus Sicherheitsgründen und zum Schutz der Übertragung eine
            SSL-/TLS-Verschlüsselung. Sie erkennen eine verschlüsselte Verbindung an dem
            Schloss-Symbol in der Adresszeile Ihres Browsers. Alle Daten werden auf Servern in
            Deutschland gespeichert. Schriftarten werden lokal eingebunden und nicht von externen
            Servern geladen.
          </p>
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            13. Änderungen dieser Datenschutzerklärung
          </h2>
          <p className="font-body text-brand-steel">
            Wir behalten uns vor, diese Datenschutzerklärung anzupassen, damit sie stets den aktuellen
            rechtlichen Anforderungen entspricht oder um Änderungen unserer Leistungen in der
            Datenschutzerklärung umzusetzen. Für Ihren erneuten Besuch gilt dann die neue
            Datenschutzerklärung.
          </p>
        </section>
      </div>
    </div>
  );
}

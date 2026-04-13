import type { Metadata } from 'next';
import { BUSINESS } from '@/lib/business-config';

export const metadata: Metadata = {
  title: 'AGB',
  description: 'Allgemeine Geschäftsbedingungen von Cam2Rent für die Vermietung von Action-Kameras.',
};

export default function AGBPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black dark:text-white mb-2">
          Allgemeine Geschäftsbedingungen (AGB)
        </h1>
        <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-10">Stand: Januar 2026</p>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 1 Geltungsbereich
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300 mb-3">
            Diese Allgemeinen Geschäftsbedingungen (nachfolgend &quot;AGB&quot;) gelten für alle
            Mietverträge über Kameraausrüstung, die zwischen
          </p>
          <div className="font-body text-brand-steel dark:text-gray-300 space-y-1 mb-3">
            <p className="font-semibold text-brand-black dark:text-white">{BUSINESS.name} – {BUSINESS.owner}</p>
            <p>{BUSINESS.fullAddress}</p>
            <p>E-Mail: {BUSINESS.emailKontakt}</p>
            <p>Telefon: {BUSINESS.phone}</p>
          </div>
          <p className="font-body text-brand-steel dark:text-gray-300">
            (nachfolgend &quot;Vermieter&quot;) und dem Kunden (nachfolgend &quot;Mieter&quot;) über
            die Website www.{BUSINESS.domain} geschlossen werden.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 2 Vertragsschluss
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Die Darstellung der Produkte auf der Website stellt kein rechtlich bindendes Angebot dar,
              sondern eine Aufforderung zur Abgabe einer Bestellung (invitatio ad offerendum).
            </li>
            <li>
              Durch das Absenden einer Buchung über die Website gibt der Mieter ein verbindliches
              Angebot zum Abschluss eines Mietvertrages ab.
            </li>
            <li>
              Der Mietvertrag kommt mit der Buchungsbestätigung per E-Mail und der erfolgreichen
              Zahlungsabwicklung zustande.
            </li>
            <li>
              Mietverträge dürfen nur von volljährigen natürlichen Personen abgeschlossen werden.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 3 Mietgegenstand & Zustand
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Die Mietausrüstung wird in funktionstüchtigem und geprüftem Zustand übergeben.
            </li>
            <li>
              Der Mieter ist verpflichtet, die Ausrüstung bei Erhalt unverzüglich auf erkennbare
              Mängel oder Schäden zu überprüfen und diese innerhalb von 24 Stunden nach Erhalt dem
              Vermieter schriftlich (per E-Mail) mitzuteilen.
            </li>
            <li>
              Nicht beanstandete Mängel gelten als bei Übergabe nicht vorhanden.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 4 Mietdauer
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Die Mietdauer wird in Kalendertagen berechnet. Sie beginnt am vereinbarten Startdatum
              und endet am vereinbarten Rückgabedatum.
            </li>
            <li>
              Bei Versand wird die Ausrüstung in der Regel einen Werktag vor Mietbeginn versendet.
              Die Rücksendung muss spätestens am Tag nach Mietende erfolgen.
            </li>
            <li>
              Eine Verlängerung der Mietdauer ist nach Verfügbarkeitsprüfung über das Kundenkonto
              möglich. Die Zusatzkosten werden automatisch berechnet und abgebucht.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 5 Preise & Zahlung
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Alle angegebenen Preise sind Endpreise. Gemäß § 19 UStG wird keine Umsatzsteuer
              erhoben (Kleinunternehmerregelung).
            </li>
            <li>
              Der Versand ist ab einem Bestellwert von 49 € kostenlos. Darunter fallen die jeweils
              ausgewiesenen Versandkosten an. Die Versandkosten beinhalten sowohl den Hin- als auch den
              Rückversand — ein frankiertes Rücksendeetikett liegt dem Paket bei.
            </li>
            <li>
              Die Zahlung erfolgt über den Zahlungsdienstleister Stripe. Akzeptiert werden
              Kreditkarte (Visa, Mastercard), PayPal, Klarna (auch Ratenzahlung), Apple Pay,
              Google Pay und weitere von Stripe unterstützte
              Zahlungsmethoden. Barzahlung ist nicht möglich.
            </li>
            <li>
              Der Mietpreis ist bei Buchungsabschluss vollständig zu entrichten. Bei Zahlung über
              Klarna gelten die Ratenzahlungsbedingungen von Klarna.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 6 Kaution (Sicherheitsleistung)
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Für jede Buchung wird eine Kaution als Vorautorisierung auf der Kreditkarte des Mieters
              blockiert. Der Betrag wird nicht abgebucht, sondern nur reserviert.
            </li>
            <li>
              Die Höhe der Kaution richtet sich nach dem Wert der gemieteten Ausrüstung und wird vor
              Abschluss der Buchung transparent angezeigt.
            </li>
            <li>
              Nach erfolgreicher Rückgabe und positiver Zustandsprüfung wird die Vorautorisierung
              innerhalb von 5 Werktagen freigegeben.
            </li>
            <li>
              Bei Beschädigungen, Verlust oder fehlenden Zubehörteilen kann die Kaution ganz oder
              teilweise einbehalten werden.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 7 Haftungsoptionen
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Der Mieter kann bei der Buchung zwischen verschiedenen Haftungsoptionen wählen:
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li><strong>Standard-Haftung:</strong> Selbstbeteiligung im Schadensfall gemäß Preisliste</li>
                <li><strong>Premium-Haftung:</strong> Reduzierte Selbstbeteiligung gegen Aufpreis</li>
              </ul>
            </li>
            <li>
              Die Haftungsoptionen werden durch ein selbstfinanziertes Reparaturdepot von cam2rent
              getragen. Es handelt sich nicht um eine Versicherung im Sinne des
              Versicherungsvertragsgesetzes (VVG).
            </li>
            <li>
              Schäden durch Vorsatz oder grobe Fahrlässigkeit sind von allen Haftungsoptionen
              ausgeschlossen. In diesen Fällen haftet der Mieter in voller Höhe des
              Wiederbeschaffungswerts.
            </li>
            <li>
              Wird keine Haftungsoption gewählt, haftet der Mieter für den vollen Wiederbeschaffungswert
              der Ausrüstung.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 8 Pflichten des Mieters
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>Der Mieter ist verpflichtet, die Mietausrüstung pfleglich und sachgemäß zu behandeln.</li>
            <li>Die Ausrüstung darf nur für den persönlichen Gebrauch des Mieters verwendet werden. Eine Weitergabe an Dritte oder gewerbliche Nutzung ohne vorherige Zustimmung ist untersagt.</li>
            <li>Der Mieter ist verpflichtet, die gesamte Ausrüstung einschließlich aller Zubehörteile vollständig zurückzugeben.</li>
            <li>Eigenmächtige Reparaturen oder technische Veränderungen an der Ausrüstung sind nicht gestattet.</li>
            <li>Schäden, Defekte oder Verlust sind dem Vermieter unverzüglich mitzuteilen.</li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 9 Stornierung & Rücktritt
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Stornierungen sind nach folgender Staffelung möglich:
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>Mehr als 7 Tage vor Mietbeginn: Kostenlose Stornierung</li>
                <li>3–6 Tage vor Mietbeginn: 50 % des Mietpreises als Stornogebühr</li>
                <li>Weniger als 2 Tage oder Nichtabholung: 100 % des Mietpreises</li>
              </ul>
            </li>
            <li>
              Stornierungen können über das Kundenkonto oder per E-Mail an {BUSINESS.emailKontakt}
              vorgenommen werden.
            </li>
            <li>Bereits bezahlte Beträge werden abzüglich eventueller Stornogebühren erstattet.</li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 10 Verspätete Rückgabe
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Wird die Ausrüstung nicht fristgerecht zurückgegeben, wird für jeden zusätzlichen Tag der
            reguläre Tagespreis berechnet. Bei erheblicher Verspätung (mehr als 3 Tage ohne
            Rückmeldung) behält sich der Vermieter die Einbehaltung der vollen Kaution sowie
            weitere rechtliche Schritte vor.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 11 Ersatzgeräte
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Sollte das gebuchte Gerät nicht verfügbar sein (z.B. durch Defekt oder verspätete
            Rückgabe eines Vormieters), behält sich der Vermieter das Recht vor, ein gleichwertiges
            oder höherwertiges Ersatzgerät zu stellen. Alternativ kann der Mieter eine vollständige
            Rückerstattung erhalten.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 12 Identitätsprüfung
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Vor der ersten Buchung kann eine Identitätsverifizierung mittels Personalausweis
            erforderlich sein. Der Mieter lädt die Vorder- und Rückseite seines Ausweises über sein
            Kundenkonto hoch. Die Verifizierung erfolgt durch den Vermieter. Ausweisdokumente werden
            ausschließlich zur Verifizierung verwendet und nach erfolgreicher Prüfung nicht länger als
            nötig aufbewahrt.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 13 Haftungsbeschränkung
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Der Vermieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des
              Körpers oder der Gesundheit sowie bei Vorsatz und grober Fahrlässigkeit.
            </li>
            <li>
              Im Übrigen haftet der Vermieter nur bei Verletzung wesentlicher Vertragspflichten
              (Kardinalpflichten) und beschränkt auf den vertragstypischen, vorhersehbaren Schaden.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 13a Bearbeitungszeiten
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              <strong>Ausweis-Verifizierung:</strong> Die Prüfung hochgeladener Ausweisdokumente erfolgt
              in der Regel innerhalb von 24 Stunden an Werktagen.
            </li>
            <li>
              <strong>Schadensprüfung:</strong> Bei Schadensmeldungen erhält der Mieter innerhalb von
              3 Werktagen eine Rückmeldung mit Einschätzung und ggf. Kostenaufstellung.
            </li>
            <li>
              <strong>Rückerstattungen:</strong> Stornierungen und berechtigte Rückerstattungen werden
              innerhalb von 5 Werktagen über den ursprünglichen Zahlungsweg erstattet.
            </li>
            <li>
              <strong>Kautionsfreigabe:</strong> Die Freigabe der Kautionsvorautorisierung erfolgt
              innerhalb von 5 Werktagen nach erfolgreicher Rückgabe und Zustandsprüfung.
            </li>
            <li>
              <strong>Kundenservice:</strong> Anfragen per E-Mail werden in der Regel innerhalb von
              24 Stunden an Werktagen beantwortet.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 14 Anwendbares Recht & Gerichtsstand
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.</li>
            <li>
              Gerichtsstand für alle Streitigkeiten aus dem Vertragsverhältnis ist, soweit gesetzlich
              zulässig, Berlin.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            § 15 Schlussbestimmungen
          </h2>
          <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Sollte eine Bestimmung dieser AGB unwirksam sein, bleibt die Wirksamkeit der übrigen
              Bestimmungen hiervon unberührt.
            </li>
            <li>
              Der Vermieter behält sich vor, diese AGB mit Wirkung für die Zukunft zu ändern.
              Für bestehende Verträge gelten die zum Zeitpunkt der Buchung gültigen AGB.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}

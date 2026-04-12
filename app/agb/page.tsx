import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AGB',
  description: 'Allgemeine Geschäftsbedingungen von cam2rent für die Vermietung von Kamera- und Zubehörprodukten.',
};

export default function AGBPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black dark:text-white mb-2">
          Allgemeine Geschäftsbedingungen
        </h1>
        <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-2">cam2rent – Stand: April 2026</p>
        <p className="text-xs font-body text-amber-600 dark:text-amber-400 mb-10">Entwurf – vor Veröffentlichung anwaltlich prüfen lassen.</p>

        <div className="prose prose-sm dark:prose-invert max-w-none font-body text-brand-steel dark:text-gray-300 [&_h2]:font-heading [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:text-brand-black [&_h2]:dark:text-white [&_h2]:mt-10 [&_h2]:mb-4 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:ml-5 [&_li]:mb-1">

          <h2>§ 1 Geltungsbereich, Vertragspartner</h2>
          <p>(1) Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Mietverträge über Kamera- und Zubehörprodukte, die Verbraucher im Sinne des § 13 BGB über die Website www.cam2rent.de mit dem Vermieter schließen.</p>
          <p>(2) Vermieter ist: cam2rent – Lennart Schickel (Einzelunternehmen), Heimsbrunner Str. 12, 12349 Berlin, Telefon 0162 / 8367477, E-Mail kontakt@cam2rent.de.</p>
          <p>(3) Abweichende oder ergänzende Bedingungen des Mieters werden nicht Vertragsbestandteil, es sei denn, der Vermieter stimmt ihrer Geltung ausdrücklich in Textform zu.</p>
          <p>(4) Der Vermieter richtet sich ausschließlich an Verbraucher. Buchungen zu gewerblichen Zwecken bedürfen der vorherigen ausdrücklichen Zustimmung des Vermieters.</p>

          <h2>§ 2 Voraussetzungen des Vertragsschlusses, Konto-Verifizierung</h2>
          <p>(1) Der Mieter erklärt, mindestens 18 Jahre alt und voll geschäftsfähig zu sein. Der Vermieter ist berechtigt, bei begründeten Zweifeln einen Altersnachweis zu verlangen; wird dieser nicht vorgelegt, kann der Vermieter vom Vertrag zurücktreten.</p>
          <p>(2) Vor der ersten Buchung muss der Mieter sein Kundenkonto beim Vermieter verifizieren. Die Verifizierung umfasst: a) die Bestätigung der hinterlegten E-Mail-Adresse durch Anklicken eines vom Vermieter versandten Verifizierungslinks, sowie b) den Upload eines gut lesbaren Fotos eines amtlichen Lichtbilddokuments (Personalausweis, Reisepass oder vergleichbares Dokument). Nicht für die Identitätsprüfung erforderliche Angaben (z. B. Augenfarbe, Körpergröße, Zugangsnummer) dürfen vom Mieter geschwärzt werden.</p>
          <p>(3) Das hochgeladene Ausweisdokument dient ausschließlich der Identitätsprüfung und der Betrugsprävention. Rechtsgrundlage der Verarbeitung ist Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse des Vermieters an der Sicherung gegen Identitätsmissbrauch). Das Dokument wird verschlüsselt gespeichert und spätestens 90 Tage nach Ende der letzten Geschäftsbeziehung, längstens nach Ablauf gesetzlicher Aufbewahrungsfristen, gelöscht.</p>
          <p>(4) Ohne abgeschlossene Verifizierung ist keine Buchung möglich. Der Vermieter kann die Freischaltung des Kontos ohne Angabe von Gründen verweigern; bereits geleistete Zahlungen werden in diesem Fall unverzüglich erstattet.</p>
          <p>(5) Der Mieter versichert, dass die von ihm angegebenen persönlichen Daten vollständig und wahrheitsgemäß sind. Änderungen sind dem Vermieter unverzüglich über das Kundenkonto mitzuteilen.</p>

          <h2>§ 3 Zustandekommen des Vertrags, Zahlung als aufschiebende Bedingung</h2>
          <p>(1) Die Darstellung der Mietgegenstände auf der Website stellt kein bindendes Angebot, sondern eine Aufforderung zur Abgabe eines Angebots dar.</p>
          <p>(2) Durch Klick auf den Button &quot;zahlungspflichtig buchen&quot; und erfolgreichen Abschluss des Zahlungsvorgangs über den Zahlungsdienstleister gibt der Mieter ein verbindliches Angebot ab.</p>
          <p>(3) Der Vertrag kommt erst zustande, wenn kumulativ folgende Voraussetzungen erfüllt sind: a) der vollständige Mietpreis inklusive Versandkosten und gewählter Schadenspauschale ist beim Zahlungsdienstleister erfolgreich autorisiert und eingezogen, b) der Vermieter hat dem Mieter eine Buchungsbestätigung per E-Mail zugesandt. Eine automatische Eingangsbestätigung über den Buchungseingang stellt noch keine Annahme des Angebots dar.</p>
          <p>(4) Schlägt die Zahlung fehl oder wird sie zurückgebucht, gilt das Angebot als nicht abgegeben; ein Vertrag kommt in diesem Fall nicht zustande.</p>
          <p>(5) Der Vermieter ist berechtigt, Buchungen innerhalb von 48 Stunden nach Zahlungseingang ohne Angabe von Gründen abzulehnen. Der bereits gezahlte Betrag wird in diesem Fall unverzüglich, spätestens binnen 14 Tagen, vollständig erstattet.</p>
          <p>(6) Eine Kaution oder Kreditkartenvorautorisierung wird nicht erhoben. Die Abrechnung etwaiger Schadenersatzansprüche erfolgt nach § 10 separat.</p>

          <h2>§ 4 Buchungsfristen</h2>
          <p>(1) Versandbuchungen sind spätestens 72 Stunden vor dem gewünschten Mietbeginn möglich.</p>
          <p>(2) Abholbuchungen sind spätestens 24 Stunden vor dem gewünschten Mietbeginn möglich.</p>
          <p>(3) Kürzere Fristen können auf Anfrage und nach Verfügbarkeit vereinbart werden.</p>

          <h2>§ 5 Preise, Zahlungsabwicklung, Kleinunternehmerregelung</h2>
          <p>(1) Es gelten die zum Zeitpunkt der Buchung auf der Website angegebenen Preise.</p>
          <p>(2) Der Vermieter ist Kleinunternehmer im Sinne des § 19 UStG. Die angegebenen Preise sind Endpreise; eine Umsatzsteuer wird nicht ausgewiesen.</p>
          <p>(3) Versandkosten werden vor Vertragsschluss gesondert ausgewiesen.</p>
          <p>(4) Die Zahlung erfolgt über den Zahlungsdienstleister Stripe. Es gelten ergänzend dessen Nutzungsbedingungen. Der Mieter ist verpflichtet, den gesamten Betrag bei Buchung zu begleichen.</p>
          <h2>§ 6 Mietdauer, Übergabe, Rückgabe</h2>
          <p>(1) Die Mietdauer ergibt sich aus der Buchungsbestätigung und dem Mietvertrag.</p>
          <p>(2) Bei Versand beginnt die Mietdauer mit dem vereinbarten Mietbeginn, unabhängig vom tatsächlichen Zustelldatum. Verzögerungen, die der Versanddienstleister zu vertreten hat, gehen nicht zu Lasten des Mieters, sofern der Vermieter die Mietsache rechtzeitig übergeben hat.</p>
          <p>(3) Bei Abholung beginnt die Mietdauer mit der tatsächlichen Übergabe an den Mieter.</p>
          <p>(4) Die Rückgabe erfolgt fristgerecht, wenn der Mieter die vollständige Mietsache am letzten Miettag bis 18:00 Uhr nachweislich an den vom Vermieter benannten Versanddienstleister übergibt (maßgeblich ist der Einlieferungsbeleg) oder – bei Abholung – dem Vermieter persönlich zurückgibt.</p>
          <p>(5) Die Rückgabe umfasst die Mietsache selbst, sämtliches mitgeliefertes Zubehör und die Originalverpackung, soweit vorhanden. Fehlendes Zubehör wird dem Mieter zum Zeitwert in Rechnung gestellt.</p>

          <h2>§ 7 Gefahrübergang beim Versand</h2>
          <p>(1) Der Vermieter trägt das Risiko des Hinversands bis zur Zustellung an die vom Mieter angegebene Lieferadresse.</p>
          <p>(2) Das Risiko beim Rückversand trägt der Vermieter ab Übergabe der Mietsache an den Versanddienstleister, sofern der Mieter den vom Vermieter bereitgestellten Rücksendeschein sowie eine transportsichere Verpackung (vorzugsweise die Originalverpackung oder die Hinsendungsverpackung) verwendet. Bei Verwendung einer nicht transportsicheren Verpackung haftet der Mieter für transportbedingte Schäden nach den gesetzlichen Vorschriften.</p>

          <h2>§ 8 Pflichten des Mieters</h2>
          <p>(1) Der Mieter verpflichtet sich, die Mietsache pfleglich, bestimmungsgemäß und unter Beachtung der Herstellerangaben sowie der Bedienungsanleitungen zu behandeln.</p>
          <p>(2) Untersagt sind insbesondere: a) die Nutzung entgegen Herstellerangaben oder außerhalb der angegebenen Einsatzbedingungen (z. B. Überschreiten von Tauchtiefen, Temperatur- oder Feuchtigkeitsgrenzen), b) das Öffnen, Modifizieren oder Reparieren der Mietsache sowie das Aufspielen nicht vom Hersteller freigegebener Firmware, c) die Weitergabe, Untervermietung, Verleihung oder sonstige Überlassung an Dritte ohne vorherige schriftliche Zustimmung des Vermieters, d) die Nutzung zu gewerblichen Zwecken ohne vorherige schriftliche Zustimmung des Vermieters, e) die Nutzung im Rahmen rechtswidriger Handlungen oder unter Verstoß gegen Rechte Dritter (insbesondere Persönlichkeitsrechte).</p>
          <p>(3) Der Mieter schützt die Mietsache vor Verlust, Diebstahl, Witterungseinflüssen außerhalb der Herstellerspezifikationen und unberechtigtem Zugriff Dritter. Die Mietsache ist insbesondere nicht unbeaufsichtigt an öffentlich zugänglichen Orten zurückzulassen.</p>
          <p>(4) Zuwiderhandlungen gegen Absatz 2 berechtigen den Vermieter zur fristlosen Kündigung des Mietvertrags und zur sofortigen Rückforderung der Mietsache. Schadensersatzansprüche bleiben unberührt.</p>
          <p>(5) Schäden, Verlust oder Diebstahl sind dem Vermieter unverzüglich, spätestens innerhalb von 48 Stunden nach Kenntnis, per E-Mail an kontakt@cam2rent.de zu melden. Bei Diebstahl ist zusätzlich unverzüglich Strafanzeige bei der Polizei zu erstatten; eine Kopie der Anzeige ist dem Vermieter binnen 7 Tagen vorzulegen.</p>

          <h2 id="haftung">§ 9 Haftung des Mieters, Schadenspauschale</h2>
          <p>(1) Der Mieter haftet nach den gesetzlichen Vorschriften für Schäden, Verlust, Zerstörung oder Diebstahl der Mietsache während der Mietdauer, soweit er diese zu vertreten hat. Maßgeblich ist der Zeitraum zwischen Übergabe und vertragsgemäßer Rückgabe.</p>
          <p>(2) Der Mieter kann bei Buchung eine Schadenspauschale wählen, die seine Ersatzpflicht der Höhe nach begrenzt. Es gelten: a) Ohne Schadenspauschale: Der Mieter haftet bis zur Höhe des Zeitwerts der Mietsache (Wiederbeschaffungswert). b) Basis-Schadenspauschale: Die Ersatzpflicht des Mieters ist im Schadensfall auf 200 EUR je Schadensereignis begrenzt (Selbstbeteiligung). c) Premium-Schadenspauschale: Die Ersatzpflicht des Mieters ist im Schadensfall auf 0 EUR begrenzt (keine Selbstbeteiligung).</p>
          <p>(3) Die Tagespauschalen sind nach Mietdauer gestaffelt: Basis: 15 EUR/Tag (1–7 Tage), 20 EUR/Tag (8–14 Tage), 25 EUR/Tag (15–21 Tage) sowie Erhöhung um 5 EUR/Tag je weiteren angefangenen Zeitraum von 7 Tagen. Premium: 25 EUR/Tag (1–7 Tage), 35 EUR/Tag (8–14 Tage), 45 EUR/Tag (15–21 Tage) sowie Erhöhung um 10 EUR/Tag je weiteren angefangenen Zeitraum von 7 Tagen. Der Gesamtbetrag wird vor Vertragsschluss auf der Website und im Mietvertrag ausgewiesen.</p>
          <p>(4) Als Schadenshöhe werden angesetzt: bei reparablen Schäden die nachgewiesenen Reparaturkosten, bei Totalschaden, Verlust oder Diebstahl der Zeitwert der Mietsache zum Schadenszeitpunkt. Der Zeitwert wird nachvollziehbar aus Anschaffungspreis, Alter und Zustand ermittelt und dem Mieter auf Verlangen dargelegt.</p>
          <p>(5) Die Haftungsbegrenzung nach Absatz 2 gilt NICHT bei: a) vorsätzlich oder grob fahrlässig verursachten Schäden, b) bestimmungswidriger Nutzung entgegen Herstellerangaben, c) Verstoß gegen § 8 Absatz 2, d) unterlassener oder erheblich verspäteter Schadensmeldung, soweit dies die Schadensfeststellung wesentlich erschwert, e) Diebstahl ohne unverzügliche polizeiliche Anzeige. In diesen Fällen haftet der Mieter in voller Höhe.</p>
          <p>(6) Die Schadenspauschale ist KEINE Versicherung im Sinne des Versicherungsvertragsgesetzes (VVG), sondern eine vertragliche Begrenzung der Ersatzpflicht des Mieters gegenüber dem Vermieter.</p>

          <h2>§ 10 Schadensabrechnung</h2>
          <p>(1) Zur Sicherung etwaiger Ansprüche des Vermieters wird weder eine Kaution noch eine Kreditkartenvorautorisierung erhoben.</p>
          <p>(2) Im Schadensfall stellt der Vermieter dem Mieter eine Rechnung mit Aufstellung des Schadens, Fotodokumentation sowie – soweit einschlägig – Kostenvoranschlag oder Reparaturrechnung. Die Zahlungsfrist beträgt 14 Tage ab Rechnungszugang.</p>
          <p>(3) Vor Rechnungsstellung erhält der Mieter die vollständige Schadensdokumentation zur Prüfung. Er kann der Schadensberechnung binnen 14 Tagen ab Zugang der Dokumentation schriftlich widersprechen und begründete Einwendungen geltend machen. Bei berechtigtem Widerspruch ist die Berechnung anzupassen.</p>
          <p>(4) Bei Zahlungsverzug des Mieters gelten die gesetzlichen Verzugsregelungen (§§ 286 ff. BGB).</p>
          <p>(5) Der Mieter bleibt verpflichtet, die Mietsache auch bei bestehenden Schadenersatzforderungen vollständig und fristgerecht zurückzugeben. Ein Zurückbehaltungsrecht an der Mietsache steht dem Mieter nicht zu.</p>
          <h2>§ 11 Mängel der Mietsache</h2>
          <p>(1) Bei Mängeln der Mietsache stehen dem Mieter die gesetzlichen Rechte nach §§ 536 ff. BGB zu, insbesondere Minderung des Mietpreises und – bei Verschulden – Schadensersatz.</p>
          <p>(2) Offensichtliche Mängel sollten dem Vermieter möglichst zeitnah angezeigt werden, damit Abhilfe durch Ersatzlieferung oder anteilige Rückerstattung geschaffen werden kann. Gesetzliche Rechte bleiben durch eine unterbliebene oder verspätete Anzeige unberührt.</p>
          <p>(3) Kann der Vermieter die Mietsache aus von ihm zu vertretenden Gründen nicht oder nicht rechtzeitig bereitstellen, teilt er dies dem Mieter unverzüglich mit. Bereits gezahlte Beträge werden binnen 14 Tagen vollständig erstattet. Weitergehende Ansprüche des Mieters bleiben unberührt.</p>

          <h2>§ 12 Verspätete Rückgabe</h2>
          <p>(1) Bei verspäteter Rückgabe schuldet der Mieter für jeden angefangenen weiteren Miettag den regulären Tagesmietpreis, sofern er die Verspätung zu vertreten hat.</p>
          <p>(2) Darüber hinaus kann der Vermieter Ersatz weiterer nachweisbar entstandener Schäden verlangen, insbesondere entgangener Mieterträge aus Folgebuchungen.</p>
          <p>(3) Dem Mieter bleibt der Nachweis vorbehalten, dass ein Schaden überhaupt nicht oder in wesentlich geringerer Höhe entstanden ist.</p>
          <p>(4) Eine nachträgliche Verlängerung der Mietdauer ist auf Anfrage möglich und bedarf der Bestätigung durch den Vermieter.</p>

          <h2>§ 13 Stornierung</h2>
          <p>(1) Unabhängig vom gesetzlichen Widerrufsrecht kann der Mieter bis zum Mietbeginn gegen folgende Stornopauschalen zurücktreten:</p>
          <ul>
            <li>mehr als 7 Tage vor Mietbeginn: kostenfrei (100 % Rückerstattung)</li>
            <li>3 bis 7 Tage vor Mietbeginn: 50 % des Mietpreises</li>
            <li>weniger als 3 Tage vor Mietbeginn: 90 % des Mietpreises</li>
          </ul>
          <p>(2) Dem Mieter bleibt ausdrücklich der Nachweis vorbehalten, dass dem Vermieter kein oder ein wesentlich geringerer Schaden entstanden ist. Dem Vermieter bleibt der Nachweis eines höheren Schadens vorbehalten.</p>
          <p>(3) Versandkosten werden bei Stornierung vor Versand vollständig erstattet.</p>
          <p>(4) Die Stornierung erfolgt per E-Mail an kontakt@cam2rent.de. Maßgeblich ist der Eingang beim Vermieter.</p>

          <h2>§ 14 Widerrufsrecht</h2>
          <p>Der Mieter als Verbraucher hat ein gesetzliches Widerrufsrecht nach §§ 355 ff. BGB. Einzelheiten, Fristen und Rechtsfolgen ergeben sich aus der separat zur Verfügung gestellten Widerrufsbelehrung, die Bestandteil des Vertrags ist und zusammen mit der Buchungsbestätigung in Textform übermittelt wird.</p>

          <h2>§ 15 Haftung des Vermieters</h2>
          <p>(1) Der Vermieter haftet unbeschränkt a) bei Vorsatz und grober Fahrlässigkeit, b) bei Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit, c) nach den Vorschriften des Produkthaftungsgesetzes, d) im Umfang einer übernommenen Garantie.</p>
          <p>(2) Bei leichter Fahrlässigkeit haftet der Vermieter nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten). Wesentliche Vertragspflichten sind solche, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht und auf deren Einhaltung der Mieter vertrauen darf. Die Haftung ist in diesen Fällen auf den bei Vertragsschluss vorhersehbaren, vertragstypischen Schaden begrenzt.</p>
          <p>(3) Eine weitergehende Haftung ist ausgeschlossen.</p>
          <p>(4) Die Haftungsbeschränkungen gelten auch für die persönliche Haftung der gesetzlichen Vertreter, Mitarbeiter und Erfüllungsgehilfen des Vermieters.</p>

          <h2>§ 16 Aufrechnung, Zurückbehaltungsrecht</h2>
          <p>Der Mieter kann gegen Forderungen des Vermieters nur mit unbestrittenen oder rechtskräftig festgestellten Gegenforderungen aufrechnen. Ein Zurückbehaltungsrecht steht dem Mieter nur insoweit zu, als seine Gegenansprüche auf demselben Vertragsverhältnis beruhen.</p>

          <h2>§ 17 Datenschutz</h2>
          <p>(1) Der Vermieter verarbeitet personenbezogene Daten des Mieters zur Vertragsdurchführung (Art. 6 Abs. 1 lit. b DSGVO), zur Betrugsprävention (Art. 6 Abs. 1 lit. f DSGVO) und zur Erfüllung gesetzlicher Aufbewahrungspflichten (Art. 6 Abs. 1 lit. c DSGVO i. V. m. § 147 AO).</p>
          <p>(2) Empfänger personenbezogener Daten sind insbesondere der Zahlungsdienstleister Stripe, der E-Mail-Dienstleister Resend sowie der Versanddienstleister Sendcloud.</p>
          <p>(3) Einzelheiten zu Art, Umfang, Zweck, Speicherdauer und Betroffenenrechten ergeben sich aus der Datenschutzerklärung, abrufbar unter www.cam2rent.de/datenschutz.</p>

          <h2>§ 18 Elektronischer Vertragsschluss, Textform</h2>
          <p>(1) Der Vertrag wird elektronisch geschlossen. Die Bestätigung erfolgt per automatisierter E-Mail an die vom Mieter angegebene Adresse.</p>
          <p>(2) Der Vertragstext, die AGB, die Widerrufsbelehrung und die Datenschutzerklärung werden vom Vermieter gespeichert und dem Mieter in Textform (PDF) übermittelt. Der Mieter kann den Vertrag zusätzlich in seinem Kundenkonto abrufen.</p>
          <p>(3) Änderungen und Ergänzungen bedürfen der Textform (E-Mail genügt). Dies gilt auch für die Aufhebung dieser Textformklausel.</p>
          <p>(4) Eine handschriftliche Unterschrift ist zur Wirksamkeit des Vertrags nicht erforderlich.</p>

          <h2>§ 19 Online-Streitbeilegung, Verbraucherschlichtung</h2>
          <p>(1) Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit: <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">https://ec.europa.eu/consumers/odr/</a></p>
          <p>(2) Der Vermieter ist nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).</p>

          <h2>§ 20 Anwendbares Recht, Schlussbestimmungen</h2>
          <p>(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Zwingende Verbraucherschutzvorschriften des Staates, in dem der Mieter seinen gewöhnlichen Aufenthalt hat, bleiben unberührt.</p>
          <p>(2) Eine Gerichtsstandsvereinbarung wird nicht getroffen; es gelten die gesetzlichen Regelungen.</p>
          <p>(3) Sollten einzelne Bestimmungen dieser AGB unwirksam oder undurchführbar sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. Die Parteien verpflichten sich, eine unwirksame Bestimmung durch eine wirksame zu ersetzen, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung möglichst nahekommt.</p>
          <p>(4) Mündliche Nebenabreden bestehen nicht.</p>

          <div className="mt-12 pt-8 border-t border-brand-border text-center">
            <p className="text-sm text-brand-muted dark:text-gray-500">cam2rent – Lennart Schickel – Heimsbrunner Str. 12, 12349 Berlin – kontakt@cam2rent.de</p>
          </div>
        </div>
      </div>
    </div>
  );
}

SELECT publish_legal_version(
  (SELECT id FROM legal_documents WHERE slug = 'impressum'),
  '# Impressum

*Angaben gemäß § 5 TMG*

## Anbieter

**cam2rent**
Lennart Schickel
Heimsbrunner Str. 12
12349 Berlin
Deutschland

## Kontakt

Telefon: 0162 / 8367477
E-Mail: kontakt@cam2rent.de

## Umsatzsteuer

Lennart Schickel ist Kleinunternehmer im Sinne von § 19 UStG. Es wird daher keine Umsatzsteuer berechnet und keine Umsatzsteuer-Identifikationsnummer ausgewiesen.

## Streitschlichtung

Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: https://ec.europa.eu/consumers/odr/

Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.

## Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV

Lennart Schickel
Heimsbrunner Str. 12
12349 Berlin

## Haftung für Inhalte

Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.

## Haftung für Links

Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.

## Urheberrecht

Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.',
  'markdown',
  'Vollständiges Impressum eingepflegt',
  NULL
);

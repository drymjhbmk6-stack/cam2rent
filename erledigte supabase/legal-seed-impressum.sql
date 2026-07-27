-- ⚠️ HISTORISCHER SEED (V1-Snapshot). NICHT ERNEUT AUSFÜHREN.
-- Maßgeblich ist ausschließlich die in der DB gepflegte Fassung (aktuell V4),
-- verwaltet über /admin/legal. Ein erneuter Aufruf würde den DB-Stand
-- überschreiben. Diese Datei wurde nur um veraltete Gesetzesnamen bereinigt
-- (TMG → DDG, § 55 RStV → § 18 MStV) und die eingestellte ODR-Plattform entfernt.
SELECT publish_legal_version(
  (SELECT id FROM legal_documents WHERE slug = 'impressum'),
  '# Impressum

*Angaben gemäß § 5 DDG*

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

## Verbraucherstreitbeilegung

Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).

## Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV

Lennart Schickel
Heimsbrunner Str. 12
12349 Berlin

## Haftung für Inhalte

Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.

## Haftung für Links

Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.

## Urheberrecht

Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.',
  'markdown',
  'Impressum aktualisiert: DDG statt TMG, § 18 MStV statt § 55 RStV, ODR-Plattform entfernt',
  NULL
);

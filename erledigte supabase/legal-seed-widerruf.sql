-- ⚠️ HISTORISCHER SEED (V1-Snapshot). NICHT ERNEUT AUSFÜHREN.
-- Maßgeblich ist ausschließlich die in der DB gepflegte Fassung
-- (legal_documents/legal_document_versions, aktuell V7), verwaltet über
-- /admin/legal. Ein erneuter Aufruf von publish_legal_version() würde diese
-- Datei als NEUE current-Version veröffentlichen und den DB-Stand überschreiben.
-- Diese Datei wurde nur um den (rechtlich falschen) § 312g-Ausschluss bereinigt
-- und um die Telefonnummer ergänzt; die vollständige V7-Struktur (u. a. Hinweis
-- zur Verlegung) lebt in der DB und ist hier bewusst NICHT nachgebildet.
SELECT publish_legal_version(
  (SELECT id FROM legal_documents WHERE slug = 'widerruf'),
  '# Widerrufsbelehrung

*Stand: Juli 2026 · Informationen zum Widerrufsrecht*

## Widerrufsrecht

Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.

Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels einer eindeutigen Erklärung (z.B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.

## Kontakt für den Widerruf

**cam2rent – Lennart Schickel**
Heimsbrunner Str. 12
12349 Berlin
Telefon: 0162 / 8367477
E-Mail: kontakt@cam2rent.de
Website: www.cam2rent.de

## Frist

Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.

## Folgen des Widerrufs

Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.

Haben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.

## Vorzeitiger Beginn der Leistung

Wenn Sie im Buchungsprozess ausdrücklich verlangen, dass wir mit der Vermietung vor Ablauf der 14-tägigen Widerrufsfrist beginnen, erlischt Ihr Widerrufsrecht mit vollständiger Erbringung der Leistung (§ 356 Abs. 4 BGB). Widerrufen Sie vor Ablauf der Frist, schulden Sie anteiligen Wertersatz (siehe „Folgen des Widerrufs").

## Muster-Widerrufsformular

Wenn Sie den Vertrag widerrufen wollen, können Sie folgendes Formular verwenden (nicht vorgeschrieben):

An: cam2rent – Lennart Schickel, Heimsbrunner Str. 12, 12349 Berlin, kontakt@cam2rent.de

Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung (*)

Bestellt am (*) / erhalten am (*):

Name des/der Verbraucher(s):

Anschrift des/der Verbraucher(s):

Datum:

Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):

*(*) Unzutreffendes streichen*',
  'markdown',
  'Widerrufsbelehrung ohne § 312g-Ausschluss (§ 356 Abs. 4 BGB), Telefon ergänzt',
  NULL
);

SELECT publish_legal_version(
  (SELECT id FROM legal_documents WHERE slug = 'widerruf'),
  '# Widerrufsbelehrung

*Informationen zum Widerrufsrecht*

## Widerrufsrecht

Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.

Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels einer eindeutigen Erklärung (z.B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.

## Kontakt für den Widerruf

**cam2rent – Lennart Schickel**
Heimsbrunner Str. 12
12349 Berlin
E-Mail: kontakt@cam2rent.de
Website: www.cam2rent.de

## Frist

Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.

## Folgen des Widerrufs

Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.

Haben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.

## Wichtiger Hinweis zum Ausschluss des Widerrufsrechts

**Bitte beachten Sie:** Das Widerrufsrecht besteht gemäß § 312g Abs. 2 Nr. 9 BGB **nicht** bei Verträgen zur Erbringung von Dienstleistungen im Zusammenhang mit Freizeitbetätigungen, wenn der Vertrag für die Erbringung einen spezifischen Termin oder Zeitraum vorsieht. Dies kann auf Kamera-Mietbuchungen mit bestätigtem Zeitraum zutreffen.

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
  'Vollständige Widerrufsbelehrung eingepflegt',
  NULL
);

SELECT publish_legal_version(
  (SELECT id FROM legal_documents WHERE slug = 'haftungsausschluss'),
  '# Haftungsbedingungen

*Stand: Januar 2026*

## § 1 Geltungsbereich

Diese Haftungsbedingungen gelten für alle Mietverträge über Kamera-, Audio- und Video-Ausrüstung, die über www.cam2rent.de gebucht werden. Sie werden mit der Auswahl und Bestätigung einer Haftungsoption Bestandteil des Mietvertrages.

## § 2 Haftungsoptionen

Bei jeder Buchung kann der Mieter zwischen folgenden Haftungsoptionen wählen:

### Ohne Haftungsbegrenzung — 0 €

Der Mieter haftet in voller Höhe des Wiederbeschaffungswerts der Ausrüstung.

### Standard-Haftungsschutz — 15 € / Miete

Deckt Schäden bei sachgemäßer Nutzung ab (z.B. Sturz-, Stoß-, Wasser- oder Elektronikschäden). Selbstbeteiligung: maximal 150 € pro Schadensfall.

### Premium-Haftungsschutz — 25 € / Miete

Vollschutz bei bestimmungsgemäßer Nutzung — keine Selbstbeteiligung im Schadensfall.

## § 3 Abgedeckte Schadensfälle

Bei Auswahl der Standard- oder Premium-Haftung sind folgende Schadensfälle abgedeckt:

- Technische Defekte durch normale Nutzung
- Sturz- und Stoßschäden
- Wasserschäden (innerhalb der Spezifikationen bzw. mit korrektem Schutzgehäuse)
- Diebstahl (mit Polizeianzeige und Aktenzeichen)
- Verlust von Kleinzubehör bis zu einem Wert von 25 €

## § 4 Ausschlüsse

**Kein Haftungsschutz besteht bei:**

- **Vorsatz oder grobe Fahrlässigkeit** — In diesen Fällen haftet der Mieter unabhängig von der gewählten Option in voller Höhe.
- **Unsachgemäße Nutzung** — z.B. fehlende Schutzgehäuse, Überschreitung von Tiefengrenzen, Missachtung der Herstelleranweisungen.
- **Verlust ohne Nachweis** — Ohne polizeiliche Anzeige oder nachvollziehbare Dokumentation.
- **Korrosion und Salzablagerungen** — Wenn die Ausrüstung nach Salzwasserkontakt nicht ordnungsgemäß mit Süßwasser gespült wurde.
- **Kosmetische Schäden** — Kratzer und Abnutzung über den normalen Verschleiß hinaus.
- **Eigenmächtige Reparaturen oder Modifikationen** — Jede nicht autorisierte Veränderung an der Ausrüstung.

## § 5 Schadensmeldung

1. Schäden müssen innerhalb von **24 Stunden** nach Auftreten gemeldet werden.
2. Bei Diebstahl oder Verlust ist eine Polizeianzeige erforderlich. Das Aktenzeichen ist bei der Schadensmeldung anzugeben.
3. Der Mieter muss auf Anfrage Fotos oder weitere Dokumentation des Schadens zur Verfügung stellen.

Schadensmeldungen können über das Kundenkonto oder per E-Mail an kontakt@cam2rent.de eingereicht werden.

## § 6 Schadensabwicklung

1. Nach Eingang der Schadensmeldung wird die Ausrüstung geprüft und die Schadenshöhe festgestellt.
2. Der Mieter wird per E-Mail über das Ergebnis und die anfallenden Kosten informiert.
3. Je nach gewählter Haftungsoption wird die Kaution teilweise oder vollständig einbehalten bzw. freigegeben.

## § 7 Schutzdauer

Der Haftungsschutz beginnt mit der Übergabe (Lieferung/Abholung) der Ausrüstung und endet einen Kalendertag nach dem vereinbarten Mietende oder bei dokumentierter Rückgabe, je nachdem was zuerst eintritt.

## § 8 Haftungsgrenzen — Zusammenfassung

| Option | Preis / Miete | Selbstbeteiligung |
|---|---|---|
| Ohne Haftungsbegrenzung | 0 € | Voller Wiederbeschaffungswert |
| Standard-Haftungsschutz | 15 € | Max. 150 € |
| Premium-Haftungsschutz | 25 € | Keine |

## Wichtiger Hinweis

Die Haftungsoptionen von cam2rent stellen **keine Versicherung** im Sinne des Versicherungsvertragsgesetzes (VVG) dar. Die Haftungsbegrenzung wird durch ein **selbstfinanziertes Reparaturdepot** von cam2rent getragen. Die erhobenen Gebühren für Standard- und Premium-Haftungsschutz fließen in dieses Depot und dienen ausschließlich der Deckung von Reparatur- und Ersatzkosten.',
  'markdown',
  'Vollständige Haftungsbedingungen eingepflegt',
  NULL
);

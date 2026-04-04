import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Widerrufsbelehrung',
  description: 'Widerrufsbelehrung von Cam2Rent – Informationen zum Widerrufsrecht bei Mietverträgen.',
};

export default function WiderrufPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black mb-2">Widerrufsbelehrung</h1>
        <p className="text-sm font-body text-brand-muted mb-10">Informationen zum Widerrufsrecht</p>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            Widerrufsrecht
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu
            widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.
          </p>
          <p className="font-body text-brand-steel">
            Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels einer eindeutigen Erklärung
            (z.B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen
            Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte
            Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            Kontakt für den Widerruf
          </h2>
          <div className="font-body text-brand-steel space-y-1">
            <p className="font-semibold text-brand-black">Cam2Rent – Lennart Schickel</p>
            <p>Heimsbrunner Str. 12</p>
            <p>12349 Berlin</p>
            <p>
              E-Mail:{' '}
              <a href="mailto:kontakt@cam2rent.de" className="text-accent-blue hover:underline">
                kontakt@cam2rent.de
              </a>
            </p>
            <p>Website: www.cam2rent.de</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            Frist
          </h2>
          <p className="font-body text-brand-steel">
            Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung
            des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            Folgen des Widerrufs
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen
            erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag
            zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns
            eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei
            der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde
            ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser
            Rückzahlung Entgelte berechnet.
          </p>
          <p className="font-body text-brand-steel">
            Haben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so
            haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem
            Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts unterrichten, bereits
            erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen
            Dienstleistungen entspricht.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            Wichtiger Hinweis zum Ausschluss des Widerrufsrechts
          </h2>
          <div className="bg-accent-amber-soft border border-accent-amber/30 rounded-card p-4">
            <p className="font-body text-brand-black font-medium mb-2">
              Bitte beachten Sie:
            </p>
            <p className="font-body text-brand-steel">
              Das Widerrufsrecht besteht gemäß § 312g Abs. 2 Nr. 9 BGB <strong>nicht</strong> bei
              Verträgen zur Erbringung von Dienstleistungen im Zusammenhang mit Freizeitbetätigungen,
              wenn der Vertrag für die Erbringung einen spezifischen Termin oder Zeitraum vorsieht.
              Dies kann auf Kamera-Mietbuchungen mit bestätigtem Zeitraum zutreffen.
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg text-brand-black mb-4">
            Muster-Widerrufsformular
          </h2>
          <p className="font-body text-brand-steel mb-3">
            Wenn Sie den Vertrag widerrufen wollen, können Sie folgendes Formular verwenden
            (nicht vorgeschrieben):
          </p>
          <div className="bg-brand-bg rounded-card p-5 font-body text-brand-steel space-y-3">
            <p>An: Cam2Rent – Lennart Schickel, Heimsbrunner Str. 12, 12349 Berlin, kontakt@cam2rent.de</p>
            <p>
              Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die
              Erbringung der folgenden Dienstleistung (*)
            </p>
            <p>Bestellt am (*) / erhalten am (*):</p>
            <p>Name des/der Verbraucher(s):</p>
            <p>Anschrift des/der Verbraucher(s):</p>
            <p>Datum:</p>
            <p>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):</p>
            <p className="text-xs text-brand-muted">(*) Unzutreffendes streichen</p>
          </div>
        </section>
      </div>
    </div>
  );
}

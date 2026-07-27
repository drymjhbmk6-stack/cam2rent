import type { Metadata } from 'next';
import Link from 'next/link';
import { BUSINESS } from '@/lib/business-config';
import { describeCancellationTiers } from '@/lib/cancellation-text';

export const metadata: Metadata = {
  title: 'Stornierungs- & Rückerstattungsbedingungen',
  description: 'Informationen zu Stornierungen, Rückerstattungen und Kautionsabwicklung bei Cam2Rent.',
};

export default function StornierungPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black dark:text-white mb-2">
          Stornierungs- & Rückerstattungsbedingungen
        </h1>
        <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-10">
          Informationen zu Stornierungen und Erstattungen
        </p>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            1. Stornierungen
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300 mb-4">
            Die Stornierung einer Buchung ist unter folgenden Bedingungen möglich:
          </p>
          <div className="space-y-3">
            {describeCancellationTiers().map((t, i) => {
              const border =
                ['border-status-success', 'border-accent-amber', 'border-status-error'][i] ??
                'border-brand-muted';
              return (
                <div key={t.compact} className={`bg-brand-bg dark:bg-brand-dark rounded-card p-4 border-l-4 ${border}`}>
                  <p className="font-body font-semibold text-brand-black dark:text-white mb-1">
                    {t.label}
                  </p>
                  <p className="font-body text-brand-steel dark:text-gray-300 text-sm">
                    {t.feePercent === 0 ? (
                      <>
                        Kostenlose Stornierung (volle Rückerstattung). Die Stornierung kann direkt über Ihr{' '}
                        <Link href="/konto/buchungen" className="text-accent-blue hover:underline">
                          Kundenkonto
                        </Link>{' '}
                        vorgenommen werden.
                      </>
                    ) : (
                      <>
                        Stornogebühr: {t.feePercent} % des Mietpreises ({t.refundPercent} % Rückerstattung).
                        Die Stornierung muss schriftlich per E-Mail an{' '}
                        <a href={`mailto:${BUSINESS.emailKontakt}`} className="text-accent-blue hover:underline">
                          {BUSINESS.emailKontakt}
                        </a>{' '}
                        erfolgen.
                      </>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="font-body text-brand-steel dark:text-gray-300 mt-4">
            Bereits bezahlte Beträge werden abzüglich der jeweiligen Stornogebühren erstattet.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            2. Widerrufsrecht
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Als Verbraucher steht Ihnen ein gesetzliches Widerrufsrecht von 14 Tagen zu. Wenn Sie im
            Buchungsprozess ausdrücklich zustimmen, dass wir vor Ablauf dieser Frist mit der Vermietung
            beginnen, erlischt Ihr Widerrufsrecht mit vollständiger Erbringung der Leistung
            (§ 356 Abs. 4 BGB). Widerrufen Sie vor Mietende, schulden Sie anteiligen Wertersatz.
            Einzelheiten finden Sie in unserer{' '}
            <Link href="/widerruf" className="text-accent-blue hover:underline">
              Widerrufsbelehrung
            </Link>
            .
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            3. Kautionsrückerstattung
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300 mb-3">
            Die bei der Buchung als Vorautorisierung blockierte Kaution wird wie folgt behandelt:
          </p>
          <ul className="list-disc list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              <strong>Rückgabe in ordnungsgemäßem Zustand:</strong> Die Vorautorisierung wird nach
              Prüfung der Ausrüstung automatisch freigegeben.
            </li>
            <li>
              <strong>Beschädigung oder fehlende Teile:</strong> Die Kaution wird teilweise oder
              vollständig einbehalten. Sie werden vorab per E-Mail über den Schadensbetrag informiert.
            </li>
            <li>
              <strong>Totalverlust:</strong> Die volle Kaution wird einbehalten. Übersteigt der
              Wiederbeschaffungswert die Kaution, werden weitere Kosten in Rechnung gestellt.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            4. Rückerstattungsabwicklung
          </h2>
          <ul className="list-disc list-inside font-body text-brand-steel dark:text-gray-300 space-y-2">
            <li>
              Rückerstattungen erfolgen innerhalb von 7 Werktagen nach Prüfung der zurückgegebenen
              Ausrüstung.
            </li>
            <li>
              Die Erstattung erfolgt über dasselbe Zahlungsmittel, das bei der ursprünglichen Buchung
              verwendet wurde.
            </li>
            <li>
              Die Freigabe der Kautionsvorautorisierung erfolgt in der Regel noch am selben Tag der
              Zustandsprüfung.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">
            Fragen?
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-300">
            Bei Fragen zu Stornierungen oder Rückerstattungen wenden Sie sich bitte an uns:{' '}
            <a href={`mailto:${BUSINESS.emailKontakt}`} className="text-accent-blue hover:underline">
              {BUSINESS.emailKontakt}
            </a>{' '}
            oder telefonisch unter {BUSINESS.phone}.
          </p>
        </section>
      </div>
    </div>
  );
}

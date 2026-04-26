import Link from 'next/link';

export const metadata = { title: 'Newsletter bestätigt — Cam2Rent' };

const STATUS: Record<string, { title: string; body: string; tone: 'ok' | 'warn' | 'error' }> = {
  ok: {
    title: 'Newsletter aktiviert',
    body: 'Vielen Dank! Du erhältst ab jetzt unsere Updates zu neuen Kameras und Aktionen.',
    tone: 'ok',
  },
  already: {
    title: 'Schon bestätigt',
    body: 'Diese Adresse ist bereits aktiv. Wir freuen uns auf dich!',
    tone: 'ok',
  },
  expired: {
    title: 'Link abgelaufen',
    body: 'Der Bestätigungslink ist nicht mehr gültig. Bitte trage dich neu ein, dann schicken wir dir einen frischen Link.',
    tone: 'warn',
  },
  invalid: {
    title: 'Link ungültig',
    body: 'Wir konnten deine Anmeldung nicht finden. Trage dich gerne neu ein.',
    tone: 'error',
  },
  error: {
    title: 'Etwas ist schiefgelaufen',
    body: 'Bitte versuche es später erneut oder schreib uns eine kurze Mail.',
    tone: 'error',
  },
};

export default async function NewsletterBestaetigtPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const config = STATUS[params.status ?? 'error'] ?? STATUS.error;
  const accent =
    config.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : config.tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="min-h-screen bg-white dark:bg-brand-black flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-brand-bg dark:bg-brand-dark rounded-card p-8 text-center">
        <h1 className={`font-heading font-bold text-2xl mb-3 ${accent}`}>{config.title}</h1>
        <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-6">{config.body}</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-accent-blue/90 transition-colors"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}

import Link from 'next/link';

export const metadata = { title: 'Newsletter abgemeldet — Cam2Rent' };

const STATUS: Record<string, { title: string; body: string; tone: 'ok' | 'warn' | 'error' }> = {
  ok: {
    title: 'Erfolgreich abgemeldet',
    body: 'Du erhältst keine weiteren Newsletter-Mails von uns. Falls du es dir anders überlegst — du kannst dich jederzeit wieder anmelden.',
    tone: 'ok',
  },
  already: {
    title: 'Bereits abgemeldet',
    body: 'Diese Adresse ist nicht mehr aktiv. Du erhältst keine Mails von uns.',
    tone: 'ok',
  },
  invalid: {
    title: 'Link ungültig',
    body: 'Der Abmelde-Link ist ungültig oder abgelaufen. Schreib uns kurz, dann nehmen wir dich manuell raus.',
    tone: 'error',
  },
  error: {
    title: 'Etwas ist schiefgelaufen',
    body: 'Bitte versuche es später erneut.',
    tone: 'error',
  },
};

export default async function NewsletterAbgemeldetPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const config = STATUS[params.status ?? 'error'] ?? STATUS.error;
  const accent =
    config.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

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

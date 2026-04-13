export const dynamic = 'force-static';

export const metadata = {
  title: 'Wartung – Cam2Rent',
};

export default function WartungPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-brand-black flex items-center justify-center px-4">
      <div className="text-center max-w-md animate-fadeIn">
        {/* Gear/wrench icon */}
        <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-accent-blue-soft flex items-center justify-center">
          <svg
            className="w-10 h-10 text-accent-blue"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M11.42 15.17l-5.66 5.66a2.12 2.12 0 01-3-3l5.66-5.66m3-3l2.12-2.12a2.12 2.12 0 013 0l.88.88a2.12 2.12 0 010 3l-2.12 2.12m-3-3l3 3M3.75 7.5l.69-.69a1.5 1.5 0 012.12 0l.88.88a1.5 1.5 0 010 2.12l-.69.69"
            />
          </svg>
        </div>

        <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-3">
          Wir sind gleich zurück!
        </h1>

        <p className="font-body text-brand-text dark:text-gray-300 mb-6 leading-relaxed">
          cam2rent wird gerade aktualisiert, damit alles noch besser läuft.
          Normalerweise dauert das nur wenige Minuten.
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-bg rounded-btn border border-brand-border">
          <div className="w-2 h-2 rounded-full bg-accent-amber animate-pulse-dot" />
          <span className="text-sm font-body text-brand-text dark:text-gray-300">
            Wartung läuft...
          </span>
        </div>

        <p className="mt-8 text-xs font-body text-brand-muted dark:text-gray-500">
          Bei dringenden Fragen:{' '}
          <a
            href="mailto:kontakt@cam2rent.de"
            className="text-accent-blue hover:underline"
          >
            kontakt@cam2rent.de
          </a>
        </p>

        {/* Logo */}
        <div className="mt-10">
          <span className="font-heading font-bold text-lg text-brand-black dark:text-white tracking-tight">
            Cam<span className="text-accent-blue">2</span>Rent
          </span>
        </div>
      </div>
    </div>
  );
}

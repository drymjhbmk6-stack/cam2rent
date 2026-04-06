import Link from 'next/link';

export default function CtaBanner() {
  return (
    <section
      className="py-20 bg-gradient-to-r from-accent-blue-soft via-blue-50 to-accent-teal-soft dark:from-gray-800 dark:via-gray-900 dark:to-gray-800"
      aria-labelledby="cta-banner-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2
          id="cta-banner-heading"
          className="font-heading font-bold text-3xl sm:text-4xl text-brand-black dark:text-gray-100 mb-4"
        >
          Bereit für dein nächstes Abenteuer?
        </h2>
        <p className="font-body text-brand-steel dark:text-gray-400 text-lg mb-8 max-w-lg mx-auto">
          Wähle deine Wunsch-Kamera und starte noch heute. Lieferung schon morgen möglich.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/kameras"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-base rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors shadow-lg shadow-brand-black/10"
          >
            Jetzt Kamera mieten
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/set-konfigurator"
            className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-brand-black dark:border-gray-400 text-brand-black dark:text-gray-100 font-heading font-semibold text-base rounded-[10px] hover:bg-brand-black dark:hover:bg-gray-700 hover:text-white transition-colors"
          >
            Eigenes Set zusammenstellen
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

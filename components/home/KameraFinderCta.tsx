import Link from 'next/link';

export default function KameraFinderCta() {
  return (
    <section className="py-12 sm:py-16 bg-brand-bg dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-card bg-white dark:bg-gray-800 border border-brand-border dark:border-gray-700 shadow-card dark:shadow-gray-900/50 overflow-hidden p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
          {/* Icon */}
          <div className="flex-shrink-0 flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-accent-blue-soft text-accent-blue">
            <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>

          {/* Text */}
          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-heading font-bold text-xl sm:text-2xl text-brand-black dark:text-gray-100 mb-2">
              Nicht sicher, welche Kamera?
            </h2>
            <p className="font-body text-brand-steel dark:text-gray-400 text-sm sm:text-base mb-5 max-w-lg">
              Beantworte 5 kurze Fragen und wir empfehlen dir die perfekte Action-Cam
              fuer dein Vorhaben.
            </p>
            <Link
              href="/kamera-finder"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-blue-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Kamera-Finder starten
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md animate-fadeIn">
        {/* Wifi off icon */}
        <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-brand-bg flex items-center justify-center">
          <svg
            className="w-10 h-10 text-brand-steel dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
            />
            {/* Diagonal line */}
            <line
              x1="4"
              y1="4"
              x2="20"
              y2="20"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-3">
          Keine Internetverbindung
        </h1>

        <p className="font-body text-brand-text dark:text-gray-300 mb-6 leading-relaxed">
          Du bist gerade offline. Prüfe deine Internetverbindung und versuche
          es erneut.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
          Erneut versuchen
        </button>

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

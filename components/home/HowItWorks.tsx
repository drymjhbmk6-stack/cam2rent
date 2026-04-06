const steps = [
  {
    number: '1',
    title: 'Kamera auswählen',
    description:
      'Stöbere durch unser Sortiment an hochwertigen Action-Cams. Filter nach Marke, Preis oder Verfügbarkeit und finde die perfekte Kamera für dein Abenteuer.',
    color: 'blue' as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-7 h-7" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
      </svg>
    ),
  },
  {
    number: '2',
    title: 'Zeitraum buchen',
    description:
      'Wähle deinen Wunschzeitraum – tageweise, Wochenende oder ganze Woche. Bezahle sicher online und wähle ob du die Kamera lieferst oder abholst.',
    color: 'teal' as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-7 h-7" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    number: '3',
    title: 'Losfilmen!',
    description:
      'Die Kamera wird zu dir geliefert – mit optionalem Haftungsschutz und einsatzbereit. Film dein Abenteuer, sende die Kamera zurück und wir erledigen den Rest.',
    color: 'amber' as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-7 h-7" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
  },
];

const colorConfig = {
  blue: {
    bg: 'bg-accent-blue-soft',
    text: 'text-accent-blue',
    number: 'bg-accent-blue text-white',
    connector: 'bg-accent-blue/30',
  },
  teal: {
    bg: 'bg-accent-teal-soft',
    text: 'text-accent-teal',
    number: 'bg-accent-teal text-white',
    connector: 'bg-accent-teal/30',
  },
  amber: {
    bg: 'bg-accent-amber-soft',
    text: 'text-accent-amber',
    number: 'bg-accent-amber text-white',
    connector: 'bg-accent-amber/30',
  },
};

export default function HowItWorks({ hideHeader = false }: { hideHeader?: boolean }) {
  return (
    <section className="py-20 bg-white dark:bg-gray-900" aria-labelledby="how-it-works-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        {!hideHeader && (
        <div className="text-center mb-14">
          <h2
            id="how-it-works-heading"
            className="font-heading font-bold text-3xl sm:text-4xl text-brand-black dark:text-gray-100 mb-4"
          >
            So funktioniert&apos;s
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-400 text-lg max-w-xl mx-auto">
            In drei einfachen Schritten zur Action-Cam – schnell, unkompliziert und abgesichert.
          </p>
        </div>
        )}

        {/* Steps */}
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
          {/* Connector lines (Desktop) */}
          <div className="hidden md:flex absolute top-12 left-1/3 right-1/3 items-center justify-between px-8 pointer-events-none" aria-hidden="true">
            <div className="flex-1 h-0.5 bg-gradient-to-r from-accent-blue/40 to-accent-teal/40 mx-4" />
            <div className="flex-1 h-0.5 bg-gradient-to-r from-accent-teal/40 to-accent-amber/40 mx-4" />
          </div>

          {steps.map((step) => {
            const colors = colorConfig[step.color];
            return (
              <div key={step.number} className="flex flex-col items-center text-center">
                {/* Icon box with number */}
                <div className="relative mb-6">
                  <div className={`w-20 h-20 rounded-2xl ${colors.bg} ${colors.text} flex items-center justify-center`}>
                    {step.icon}
                  </div>
                  <span
                    className={`absolute -top-2 -right-2 w-7 h-7 rounded-full ${colors.number} font-heading font-bold text-sm flex items-center justify-center shadow-md`}
                  >
                    {step.number}
                  </span>
                </div>

                <h3 className="font-heading font-semibold text-xl text-brand-black dark:text-gray-100 mb-3">
                  {step.title}
                </h3>
                <p className="font-body text-sm text-brand-steel dark:text-gray-400 leading-relaxed max-w-xs">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import Link from 'next/link';

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  );
}

const trustBadges = [
  'Mit Haftungsschutz',
  'Kostenloser Versand',
  '24h Lieferung',
];

export default function Hero() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-accent-blue via-blue-600 to-blue-800 text-white"
      aria-labelledby="hero-heading"
    >
      {/* Dot pattern overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        aria-hidden="true"
      />

      {/* Decorative blobs */}
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-black/10 blur-3xl" aria-hidden="true" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-32">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-sm font-body font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-status-success animate-pulse flex-shrink-0" aria-hidden="true" />
            Neu: GoPro Hero 13 verfügbar
          </div>

          {/* Headline */}
          <h1
            id="hero-heading"
            className="font-heading font-bold text-4xl sm:text-5xl lg:text-6xl leading-tight text-white mb-6 text-balance"
          >
            Action-Cams mieten
            <br />
            <span className="text-white/90">statt kaufen</span>
          </h1>

          {/* Subline */}
          <p className="font-body text-lg sm:text-xl text-white/80 leading-relaxed mb-10 max-w-xl">
            Hochwertige Action-Kameras ab{' '}
            <span className="font-semibold text-white">9,90 €/Tag</span>.
            Mit Haftungsschutz, schnell geliefert, flexibel.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <Link
              href="/kameras"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-brand-black font-heading font-semibold text-base rounded-[10px] hover:bg-blue-50 transition-colors shadow-lg shadow-black/10"
            >
              Kameras entdecken
            </Link>
            <Link
              href="/so-funktionierts"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-transparent text-white font-heading font-semibold text-base rounded-[10px] border-2 border-white/50 hover:border-white hover:bg-white/10 transition-colors"
            >
              So funktioniert&apos;s
            </Link>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            {trustBadges.map((badge) => (
              <div key={badge} className="flex items-center gap-2 text-white/90">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                  <CheckIcon />
                </span>
                <span className="text-sm font-body font-medium">{badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

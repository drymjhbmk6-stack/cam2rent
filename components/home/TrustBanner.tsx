const stats = [
  { value: '500+', label: 'Kunden vertrauen uns' },
  { value: '50+', label: 'Kameras verfügbar' },
  { value: '4.9 ★', label: 'Durchschnittsbewertung' },
  { value: '24h', label: 'Expresslieferung' },
];

export default function TrustBanner() {
  return (
    <section className="bg-brand-black text-white py-14" aria-labelledby="trust-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="trust-heading" className="sr-only">
          Unsere Zahlen
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={`text-center ${
                index < stats.length - 1
                  ? 'lg:border-r lg:border-white/10'
                  : ''
              }`}
            >
              <div className="font-heading font-bold text-3xl sm:text-4xl text-white mb-2">
                {stat.value}
              </div>
              <div className="font-body text-sm text-brand-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

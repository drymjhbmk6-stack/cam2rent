import Link from 'next/link';

export default function AdminPreiseOverviewPage() {
  const cards = [
    {
      href: '/admin/preise/versand',
      title: 'Versandkosten',
      desc: 'Kostenloser Versand ab X €, Standard- und Expressversand',
    },
    {
      href: '/admin/preise/haftung',
      title: 'Haftung & Kaution',
      desc: 'Haftungsoptionen mit Eigenbeteiligung, 3 Kaution-Stufen',
    },
    {
      href: '/admin/preise/kameras',
      title: 'Kamera-Preise',
      desc: 'Vollständige Preistabelle pro Kamera (Tag 1–30+), neues Produkt anlegen',
    },
    {
      href: '/admin/sets',
      title: 'Sets',
      desc: 'Zubehör-Pakete zu Pauschalpreisen verwalten',
    },
    {
      href: '/admin/zubehoer',
      title: 'Zubehör',
      desc: 'Zubehörteile anlegen, Preise und Verfügbarkeit verwalten',
    },
  ];

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-heading font-bold text-2xl text-brand-black">Preise & Produkte</h1>
          <p className="text-sm font-body text-brand-muted mt-1">
            Wähle einen Bereich zum Bearbeiten
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="bg-white border border-brand-border rounded-2xl p-6 hover:border-brand-black hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-2">
                <h2 className="font-heading font-bold text-base text-brand-black">{card.title}</h2>
                <span className="text-brand-muted group-hover:text-brand-black transition-colors text-lg">→</span>
              </div>
              <p className="text-xs font-body text-brand-muted leading-relaxed">{card.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

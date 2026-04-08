'use client';

interface TypeCardProps {
  title: string;
  color: 'cyan' | 'purple';
  items: string[];
}

interface BlogTypeCardsProps {
  card1: TypeCardProps;
  card2: TypeCardProps;
}

const COLORS = {
  cyan: { border: '#06b6d4', bg: 'rgba(6,182,212,0.08)', check: 'rgba(6,182,212,0.2)', text: '#06b6d4' },
  purple: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', check: 'rgba(139,92,246,0.2)', text: '#8b5cf6' },
};

export default function BlogTypeCards({ card1, card2 }: BlogTypeCardsProps) {
  const cards = [card1, card2];
  return (
    <div className="my-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((card, i) => {
        const c = COLORS[card.color];
        return (
          <div key={i} className="rounded-xl p-5" style={{ background: '#1e293b', borderTop: `3px solid ${c.border}` }}>
            <h4 className="font-heading font-bold text-sm mb-3" style={{ color: c.text }}>{card.title}</h4>
            <ul className="space-y-2">
              {card.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-sm font-body" style={{ color: '#e2e8f0' }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold" style={{ background: c.check, color: c.text }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

'use client';

interface BlogVerdictProps {
  headline?: string;
  children: React.ReactNode;
}

export default function BlogVerdict({ headline = 'Beide haben ihre Staerken', children }: BlogVerdictProps) {
  return (
    <div className="my-10 rounded-xl overflow-hidden" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-6 py-6 sm:px-8 sm:py-8">
        <span className="text-[10px] font-heading font-bold uppercase tracking-widest block mb-2" style={{ color: '#06b6d4' }}>
          Unser Urteil
        </span>
        <h3 className="font-heading font-bold text-lg sm:text-xl mb-3" style={{ color: '#e2e8f0' }}>
          {headline}
        </h3>
        <div className="text-sm font-body leading-relaxed" style={{ color: '#94a3b8' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

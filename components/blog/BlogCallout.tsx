'use client';

interface BlogCalloutProps {
  type?: 'tipp' | 'wichtig' | 'info' | 'fazit';
  label?: string;
  children: React.ReactNode;
}

const STYLES = {
  tipp: { border: '#06b6d4', bg: 'rgba(6,182,212,0.07)', label: 'Tipp', icon: '💡' },
  wichtig: { border: '#f59e0b', bg: 'rgba(245,158,11,0.07)', label: 'Wichtig', icon: '⚠️' },
  info: { border: '#3b82f6', bg: 'rgba(59,130,246,0.07)', label: 'Info', icon: '📌' },
  fazit: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.07)', label: 'Fazit', icon: '✅' },
};

export default function BlogCallout({ type = 'tipp', label, children }: BlogCalloutProps) {
  const s = STYLES[type];
  return (
    <div
      className="my-8 rounded-xl overflow-hidden"
      style={{ borderLeft: `3px solid ${s.border}`, background: s.bg }}
    >
      <div className="px-5 py-4">
        <span className="text-[11px] font-heading font-bold uppercase tracking-wider block mb-2" style={{ color: s.border }}>
          {label || s.label}
        </span>
        <div className="text-sm font-body leading-relaxed text-gray-300">
          {children}
        </div>
      </div>
    </div>
  );
}

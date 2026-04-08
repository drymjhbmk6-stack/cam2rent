'use client';

import Markdown from 'react-markdown';
import type { ComponentPropsWithoutRef } from 'react';

function Blockquote({ children }: ComponentPropsWithoutRef<'blockquote'>) {
  const text = String(children ?? '');

  let borderColor = '#06b6d4';
  let bgColor = 'rgba(6,182,212,0.07)';
  let label = 'INFO';

  if (text.includes('Tipp') || text.includes('tipp')) {
    borderColor = '#06b6d4'; bgColor = 'rgba(6,182,212,0.07)'; label = 'TIPP';
  } else if (text.includes('Wichtig') || text.includes('Achtung') || text.includes('wichtig')) {
    borderColor = '#f59e0b'; bgColor = 'rgba(245,158,11,0.07)'; label = 'WICHTIG';
  } else if (text.includes('Fazit') || text.includes('fazit') || text.includes('Urteil')) {
    borderColor = '#8b5cf6'; bgColor = 'rgba(139,92,246,0.07)'; label = 'FAZIT';
  } else if (text.includes('Gut zu wissen') || text.includes('Info')) {
    borderColor = '#3b82f6'; bgColor = 'rgba(59,130,246,0.07)'; label = 'GUT ZU WISSEN';
  }

  return (
    <div className="my-8 rounded-xl overflow-hidden not-prose" style={{ borderLeft: `3px solid ${borderColor}`, background: bgColor }}>
      <div className="px-5 py-4">
        <span className="text-[10px] font-heading font-bold uppercase tracking-widest block mb-2" style={{ color: borderColor }}>{label}</span>
        <div className="text-sm font-body leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0" style={{ color: '#cbd5e1' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Heading2({ children }: ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2 className="not-prose relative font-heading font-bold text-xl sm:text-2xl mt-12 mb-5 pt-2" style={{ color: '#f8fafc' }}>
      <span className="absolute top-0 left-0 w-8 h-1 rounded-full" style={{ background: '#06b6d4' }} />
      {children}
    </h2>
  );
}

function Heading3({ children }: ComponentPropsWithoutRef<'h3'>) {
  return (
    <h3 className="not-prose font-heading font-bold text-lg mt-8 mb-3" style={{ color: '#e2e8f0' }}>
      {children}
    </h3>
  );
}

function Table({ children }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="my-8 rounded-xl overflow-hidden not-prose" style={{ background: '#1e293b', border: '1px solid rgba(6,182,212,0.12)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

function Thead({ children }: ComponentPropsWithoutRef<'thead'>) {
  return <thead style={{ background: '#111827' }}>{children}</thead>;
}

function Th({ children }: ComponentPropsWithoutRef<'th'>) {
  return (
    <th className="px-4 py-3 text-left font-heading font-semibold text-xs uppercase tracking-wider" style={{ color: '#94a3b8' }}>
      {children}
    </th>
  );
}

function Td({ children }: ComponentPropsWithoutRef<'td'>) {
  const text = String(children ?? '');
  // Fettgedruckte Werte oder Gewinner-Markierungen erkennen
  const isHighlight = text.includes('✓') || text.includes('★');
  return (
    <td className="px-4 py-3 font-body" style={{ color: isHighlight ? '#06b6d4' : '#e2e8f0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {children}
    </td>
  );
}

function Tr({ children }: ComponentPropsWithoutRef<'tr'>) {
  return <tr className="transition-colors hover:bg-white/[0.03]">{children}</tr>;
}

function Paragraph({ children }: ComponentPropsWithoutRef<'p'>) {
  return (
    <p className="not-prose text-[15px] sm:text-base font-body leading-relaxed mb-5" style={{ color: '#cbd5e1', fontWeight: 300 }}>
      {children}
    </p>
  );
}

function Strong({ children }: ComponentPropsWithoutRef<'strong'>) {
  return <strong className="font-semibold" style={{ color: '#f8fafc' }}>{children}</strong>;
}

function Anchor({ href, children }: ComponentPropsWithoutRef<'a'>) {
  return (
    <a href={href} className="font-medium transition-colors" style={{ color: '#06b6d4', textDecoration: 'none' }}>
      {children}
    </a>
  );
}

function UnorderedList({ children }: ComponentPropsWithoutRef<'ul'>) {
  return <ul className="not-prose my-4 space-y-2 ml-1">{children}</ul>;
}

function OrderedList({ children }: ComponentPropsWithoutRef<'ol'>) {
  return <ol className="not-prose my-4 space-y-2 ml-1 list-none counter-reset-item">{children}</ol>;
}

function ListItem({ children }: ComponentPropsWithoutRef<'li'>) {
  return (
    <li className="flex items-start gap-3 text-[15px] font-body" style={{ color: '#cbd5e1', fontWeight: 300 }}>
      <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: '#06b6d4' }} />
      <span className="[&_strong]:font-semibold [&_strong]:text-white">{children}</span>
    </li>
  );
}

export default function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="max-w-none">
      <Markdown
        components={{
          blockquote: Blockquote,
          h2: Heading2,
          h3: Heading3,
          table: Table,
          thead: Thead,
          th: Th,
          td: Td,
          tr: Tr,
          p: Paragraph,
          strong: Strong,
          a: Anchor,
          ul: UnorderedList,
          ol: OrderedList,
          li: ListItem,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

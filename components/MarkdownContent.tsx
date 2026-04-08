'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentPropsWithoutRef } from 'react';

function Blockquote({ children }: ComponentPropsWithoutRef<'blockquote'>) {
  const text = String(children ?? '');

  let borderColor = '#06b6d4';
  let bgLight = 'rgba(6,182,212,0.06)';
  let bgDark = 'rgba(6,182,212,0.07)';
  let label = 'INFO';

  if (text.includes('Tipp') || text.includes('tipp')) {
    borderColor = '#06b6d4'; bgLight = 'rgba(6,182,212,0.06)'; bgDark = 'rgba(6,182,212,0.07)'; label = 'TIPP';
  } else if (text.includes('Wichtig') || text.includes('Achtung') || text.includes('wichtig')) {
    borderColor = '#f59e0b'; bgLight = 'rgba(245,158,11,0.06)'; bgDark = 'rgba(245,158,11,0.07)'; label = 'WICHTIG';
  } else if (text.includes('Fazit') || text.includes('fazit') || text.includes('Urteil')) {
    borderColor = '#8b5cf6'; bgLight = 'rgba(139,92,246,0.06)'; bgDark = 'rgba(139,92,246,0.07)'; label = 'FAZIT';
  } else if (text.includes('Gut zu wissen') || text.includes('Info')) {
    borderColor = '#3b82f6'; bgLight = 'rgba(59,130,246,0.06)'; bgDark = 'rgba(59,130,246,0.07)'; label = 'GUT ZU WISSEN';
  }

  return (
    <div className="my-8 rounded-xl overflow-hidden not-prose blog-callout" style={{ borderLeft: `3px solid ${borderColor}`, '--bg-light': bgLight, '--bg-dark': bgDark } as React.CSSProperties}>
      <div className="px-5 py-4">
        <span className="text-[10px] font-heading font-bold uppercase tracking-widest block mb-2" style={{ color: borderColor }}>{label}</span>
        <div className="text-sm font-body leading-relaxed text-brand-steel dark:text-gray-300 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:text-brand-black [&_strong]:dark:text-white">
          {children}
        </div>
      </div>
    </div>
  );
}

function Heading2({ children }: ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2 className="not-prose relative font-heading font-bold text-xl sm:text-2xl mt-12 mb-5 pt-2 text-brand-black dark:text-white">
      <span className="absolute top-0 left-0 w-8 h-1 rounded-full bg-accent-teal dark:bg-cyan-400" />
      {children}
    </h2>
  );
}

function Heading3({ children }: ComponentPropsWithoutRef<'h3'>) {
  return (
    <h3 className="not-prose font-heading font-bold text-lg mt-8 mb-3 text-brand-black dark:text-gray-100">
      {children}
    </h3>
  );
}

function Table({ children }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="my-8 rounded-xl overflow-hidden not-prose bg-brand-bg dark:bg-[#1e293b] border border-brand-border dark:border-cyan-500/12">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

function Thead({ children }: ComponentPropsWithoutRef<'thead'>) {
  return <thead className="bg-gray-100 dark:bg-[#111827]">{children}</thead>;
}

function Th({ children }: ComponentPropsWithoutRef<'th'>) {
  return (
    <th className="px-4 py-3 text-left font-heading font-semibold text-xs uppercase tracking-wider text-brand-steel dark:text-gray-400">
      {children}
    </th>
  );
}

function Td({ children }: ComponentPropsWithoutRef<'td'>) {
  return (
    <td className="px-4 py-3 font-body text-brand-text dark:text-gray-200 border-t border-brand-border/40 dark:border-white/5">
      {children}
    </td>
  );
}

function Tr({ children }: ComponentPropsWithoutRef<'tr'>) {
  return <tr className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">{children}</tr>;
}

function Paragraph({ children }: ComponentPropsWithoutRef<'p'>) {
  return (
    <p className="not-prose text-[15px] sm:text-base font-body font-light leading-relaxed mb-5 text-brand-text dark:text-gray-300">
      {children}
    </p>
  );
}

function Strong({ children }: ComponentPropsWithoutRef<'strong'>) {
  return <strong className="font-semibold text-brand-black dark:text-white">{children}</strong>;
}

function Anchor({ href, children }: ComponentPropsWithoutRef<'a'>) {
  return (
    <a href={href} className="font-medium transition-colors text-accent-teal dark:text-cyan-400 hover:underline no-underline">
      {children}
    </a>
  );
}

function UnorderedList({ children }: ComponentPropsWithoutRef<'ul'>) {
  return <ul className="not-prose my-4 space-y-2 ml-1">{children}</ul>;
}

function OrderedList({ children }: ComponentPropsWithoutRef<'ol'>) {
  return <ol className="not-prose my-4 space-y-2 ml-1 list-none">{children}</ol>;
}

function ListItem({ children }: ComponentPropsWithoutRef<'li'>) {
  return (
    <li className="flex items-start gap-3 text-[15px] font-body font-light text-brand-text dark:text-gray-300">
      <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-accent-teal dark:bg-cyan-400" />
      <span className="[&_strong]:font-semibold [&_strong]:text-brand-black [&_strong]:dark:text-white">{children}</span>
    </li>
  );
}

export default function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="max-w-none [&_.blog-callout]:bg-[var(--bg-light)] dark:[&_.blog-callout]:bg-[var(--bg-dark)]">
      <Markdown
        remarkPlugins={[remarkGfm]}
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

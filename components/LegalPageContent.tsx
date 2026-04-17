'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentPropsWithoutRef } from 'react';

/**
 * Markdown-Rendering für Rechtstexte im cam2rent-Stil.
 * Entspricht exakt dem Styling der hardcoded Legal-Fallback-Seiten:
 * - Sections mit mb-10 Abstand
 * - font-heading für Überschriften
 * - font-body text-brand-steel für Text
 * - Dark-Mode Support
 */

function Heading1() {
  // H1 wird vom LegalPage-Wrapper gesetzt, im Markdown ignorieren
  return null;
}

function Heading2({ children }: ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2 className="font-heading font-semibold text-lg text-brand-black dark:text-white mt-10 mb-4 first:mt-0">
      {children}
    </h2>
  );
}

function Heading3({ children }: ComponentPropsWithoutRef<'h3'>) {
  return (
    <h3 className="font-heading font-semibold text-base text-brand-black dark:text-white mt-6 mb-3">
      {children}
    </h3>
  );
}

function Paragraph({ children }: ComponentPropsWithoutRef<'p'>) {
  return (
    <p className="font-body text-brand-steel dark:text-gray-300 mb-3 leading-relaxed">
      {children}
    </p>
  );
}

function Strong({ children }: ComponentPropsWithoutRef<'strong'>) {
  return <strong className="font-semibold text-brand-black dark:text-white">{children}</strong>;
}

function Emphasis({ children }: ComponentPropsWithoutRef<'em'>) {
  // Erstes em-Element (Stand: ...) als Untertitel stylen
  return <em className="text-sm font-body text-brand-muted dark:text-gray-400 not-italic">{children}</em>;
}

function Anchor({ href, children }: ComponentPropsWithoutRef<'a'>) {
  return (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="text-accent-blue hover:underline"
    >
      {children}
    </a>
  );
}

function UnorderedList({ children }: ComponentPropsWithoutRef<'ul'>) {
  return (
    <ul className="list-disc list-inside font-body text-brand-steel dark:text-gray-300 space-y-2 mb-3 ml-1">
      {children}
    </ul>
  );
}

function OrderedList({ children }: ComponentPropsWithoutRef<'ol'>) {
  return (
    <ol className="list-decimal list-inside font-body text-brand-steel dark:text-gray-300 space-y-2 mb-3 ml-1">
      {children}
    </ol>
  );
}

function ListItem({ children }: ComponentPropsWithoutRef<'li'>) {
  return <li className="leading-relaxed">{children}</li>;
}

function Blockquote({ children }: ComponentPropsWithoutRef<'blockquote'>) {
  return (
    <div className="bg-brand-bg dark:bg-white/5 rounded-xl p-5 border border-brand-border dark:border-white/10 mb-4">
      <div className="font-body text-brand-steel dark:text-gray-300 leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

function Table({ children }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 mb-4">
      <table className="w-full text-sm font-body">
        {children}
      </table>
    </div>
  );
}

function Thead({ children }: ComponentPropsWithoutRef<'thead'>) {
  return (
    <thead>
      <tr className="border-b-2 border-brand-border dark:border-white/10">
        {children}
      </tr>
    </thead>
  );
}

function Th({ children }: ComponentPropsWithoutRef<'th'>) {
  return (
    <th className="text-left py-3 px-3 font-heading font-semibold text-brand-black dark:text-white">
      {children}
    </th>
  );
}

function Td({ children }: ComponentPropsWithoutRef<'td'>) {
  return (
    <td className="py-3 px-3 text-brand-steel dark:text-gray-300 border-b border-brand-border dark:border-white/10">
      {children}
    </td>
  );
}

function Hr() {
  return <hr className="border-brand-border dark:border-white/10 my-8" />;
}

function Code({ children }: ComponentPropsWithoutRef<'code'>) {
  return (
    <code className="bg-brand-bg dark:bg-brand-dark px-1.5 py-0.5 rounded text-sm font-mono">
      {children}
    </code>
  );
}

export default function LegalPageContent({ children }: { children: string }) {
  return (
    <div className="legal-content">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: Heading1,
          h2: Heading2,
          h3: Heading3,
          p: Paragraph,
          strong: Strong,
          em: Emphasis,
          a: Anchor,
          ul: UnorderedList,
          ol: OrderedList,
          li: ListItem,
          blockquote: Blockquote,
          table: Table,
          thead: Thead,
          th: Th,
          td: Td,
          hr: Hr,
          code: Code,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

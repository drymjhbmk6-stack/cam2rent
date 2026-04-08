'use client';

import Markdown from 'react-markdown';
import type { ComponentPropsWithoutRef } from 'react';

function Blockquote({ children }: ComponentPropsWithoutRef<'blockquote'>) {
  // Inhalt als String extrahieren fuer Typ-Erkennung
  const text = String(children ?? '');

  // Typ basierend auf Inhalt erkennen
  let borderColor = '#3b82f6';
  let bgColor = 'rgba(59,130,246,0.06)';
  let darkBgColor = 'rgba(59,130,246,0.08)';
  let icon = 'ℹ️';

  if (text.includes('Tipp') || text.includes('tipp')) {
    borderColor = '#22c55e'; bgColor = 'rgba(34,197,94,0.06)'; darkBgColor = 'rgba(34,197,94,0.08)'; icon = '💡';
  } else if (text.includes('Wichtig') || text.includes('Achtung') || text.includes('wichtig')) {
    borderColor = '#f59e0b'; bgColor = 'rgba(245,158,11,0.06)'; darkBgColor = 'rgba(245,158,11,0.08)'; icon = '⚠️';
  } else if (text.includes('Fazit') || text.includes('fazit')) {
    borderColor = '#8b5cf6'; bgColor = 'rgba(139,92,246,0.06)'; darkBgColor = 'rgba(139,92,246,0.08)'; icon = '✅';
  } else if (text.includes('Gut zu wissen') || text.includes('Info')) {
    borderColor = '#06b6d4'; bgColor = 'rgba(6,182,212,0.06)'; darkBgColor = 'rgba(6,182,212,0.08)'; icon = '📌';
  }

  return (
    <div
      className="my-6 rounded-xl border-l-4 px-5 py-4 not-prose"
      style={{ borderColor, background: bgColor }}
    >
      <style>{`@media (prefers-color-scheme: dark) { .bq-dark { background: ${darkBgColor} !important; } }`}</style>
      <div className="flex gap-3">
        <span className="text-lg shrink-0 mt-0.5">{icon}</span>
        <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 [&_strong]:text-gray-900 [&_strong]:dark:text-white [&_p]:mb-2 [&_p:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="prose prose-lg max-w-none font-body
      prose-headings:font-heading prose-headings:text-brand-black prose-headings:dark:text-white prose-headings:font-bold
      prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
      prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
      prose-p:text-brand-text prose-p:dark:text-gray-300 prose-p:leading-relaxed prose-p:text-[16px]
      prose-li:text-brand-text prose-li:dark:text-gray-300 prose-li:text-[16px]
      prose-a:text-accent-blue prose-a:no-underline prose-a:hover:underline
      prose-strong:text-brand-black prose-strong:dark:text-white prose-strong:font-semibold
      prose-code:text-accent-blue prose-code:bg-accent-blue/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
      prose-ul:my-4 prose-ol:my-4 prose-li:my-1
      prose-img:rounded-card prose-img:shadow-card
      prose-table:w-full prose-table:text-sm prose-table:border-collapse
      prose-thead:bg-brand-bg prose-thead:dark:bg-white/5
      prose-th:font-heading prose-th:font-semibold prose-th:text-brand-black prose-th:dark:text-white prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:border prose-th:border-brand-border prose-th:dark:border-gray-700
      prose-td:px-4 prose-td:py-2.5 prose-td:border prose-td:border-brand-border prose-td:dark:border-gray-700 prose-td:text-brand-text prose-td:dark:text-gray-300
      [&_tbody_tr:nth-child(even)]:bg-brand-bg/30 [&_tbody_tr:nth-child(even)]:dark:bg-white/[0.02]
      [&_table]:rounded-xl [&_table]:overflow-hidden [&_table]:shadow-card [&_table]:dark:shadow-gray-900/50
    ">
      <Markdown components={{ blockquote: Blockquote }}>{children}</Markdown>
    </div>
  );
}

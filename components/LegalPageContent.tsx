import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Server-kompatible Markdown-Rendering-Komponente für Rechtstexte.
 * Kein 'use client' — kann direkt in Server Components genutzt werden.
 * Styles sind auf Legal-Texte optimiert (nicht Blog-Styles).
 */
export default function LegalPageContent({ children }: { children: string }) {
  return (
    <div className="prose prose-sm sm:prose max-w-none
      prose-headings:font-heading prose-headings:text-brand-black dark:prose-headings:text-white
      prose-p:font-body prose-p:text-brand-steel dark:prose-p:text-gray-300
      prose-li:font-body prose-li:text-brand-steel dark:prose-li:text-gray-300
      prose-strong:text-brand-black dark:prose-strong:text-white
      prose-a:text-accent-blue prose-a:no-underline hover:prose-a:underline
      prose-table:text-sm
      prose-th:text-left prose-th:font-heading prose-th:font-semibold prose-th:text-brand-black dark:prose-th:text-white
      prose-td:text-brand-steel dark:prose-td:text-gray-300
      prose-hr:border-brand-border dark:prose-hr:border-white/10
      prose-blockquote:border-accent-blue prose-blockquote:text-brand-steel dark:prose-blockquote:text-gray-300
    ">
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}

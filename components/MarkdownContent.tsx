'use client';

import Markdown from 'react-markdown';

export default function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:font-heading prose-headings:text-brand-black prose-p:text-brand-steel prose-p:leading-relaxed prose-li:text-brand-steel prose-a:text-accent-blue prose-strong:text-brand-black font-body">
      <Markdown>{children}</Markdown>
    </div>
  );
}

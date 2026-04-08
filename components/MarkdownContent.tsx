'use client';

import Markdown from 'react-markdown';

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
      prose-blockquote:border-l-accent-blue prose-blockquote:text-brand-steel prose-blockquote:dark:text-gray-400
      prose-code:text-accent-blue prose-code:bg-accent-blue/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
      prose-ul:my-4 prose-ol:my-4 prose-li:my-1
      prose-img:rounded-card prose-img:shadow-card
    ">
      <Markdown>{children}</Markdown>
    </div>
  );
}

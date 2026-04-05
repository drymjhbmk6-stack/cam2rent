'use client';

import { useRef, useState } from 'react';
import Markdown from 'react-markdown';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

const TOOLBAR: { label: string; icon: string; prefix: string; suffix: string; block?: boolean }[] = [
  { label: 'Fett', icon: 'B', prefix: '**', suffix: '**' },
  { label: 'Kursiv', icon: 'I', prefix: '*', suffix: '*' },
  { label: 'Überschrift', icon: 'H', prefix: '### ', suffix: '', block: true },
  { label: 'Liste', icon: '•', prefix: '- ', suffix: '', block: true },
  { label: 'Link', icon: '🔗', prefix: '[', suffix: '](url)' },
];

export default function MarkdownEditor({ value, onChange, placeholder, rows = 6 }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(prefix: string, suffix: string, block?: boolean) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);

    const needsNewline = block && before.length > 0 && !before.endsWith('\n');
    const nl = needsNewline ? '\n' : '';

    const inserted = `${nl}${prefix}${selected || 'Text'}${suffix}`;
    const newValue = before + inserted + after;
    onChange(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = before.length + nl.length + prefix.length;
      const cursorEnd = cursorPos + (selected || 'Text').length;
      ta.setSelectionRange(cursorPos, cursorEnd);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        {!preview && TOOLBAR.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.label}
            onClick={() => insert(t.prefix, t.suffix, t.block)}
            className="px-2 py-1 text-xs font-heading font-semibold rounded-md border border-brand-border bg-brand-bg text-brand-muted hover:bg-brand-border hover:text-brand-black transition-colors"
          >
            {t.icon}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className={`ml-auto px-3 py-1 text-xs font-heading font-semibold rounded-md border transition-colors ${
            preview
              ? 'bg-accent-blue text-white border-accent-blue'
              : 'border-brand-border bg-brand-bg text-brand-muted hover:bg-brand-border hover:text-brand-black'
          }`}
        >
          {preview ? 'Bearbeiten' : 'Vorschau'}
        </button>
      </div>

      {preview ? (
        <div className="w-full min-h-[120px] px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-white prose prose-sm max-w-none prose-headings:font-heading prose-headings:text-brand-black prose-p:text-brand-steel prose-li:text-brand-steel prose-a:text-accent-blue">
          <Markdown>{value || '*Keine Beschreibung*'}</Markdown>
        </div>
      ) : (
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue resize-y"
        />
      )}
    </div>
  );
}

'use client';

import React from 'react';

/**
 * Token-basierte Formular-Bausteine (Schritt 6). `Field` umhüllt Label + Control
 * + optionalen Fehler-/Hilfetext. `Input`/`Select`/`Textarea` sind einheitlich
 * gestylte Controls — ersetzen die vielfach kopierten className-Strings.
 * `fontSize: 16` verhindert iOS-Auto-Zoom.
 */

const controlStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--admin-input-bg)',
  border: '1px solid var(--admin-input-border)',
  borderRadius: 10,
  color: 'var(--admin-text)',
  padding: '9px 12px',
  fontSize: 16,
  outline: 'none',
};

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  style,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  error?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      {label && (
        <label htmlFor={htmlFor} style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text-2)' }}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <span style={{ fontSize: 12, color: 'var(--admin-danger)' }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>{hint}</span>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, ...rest }, ref) {
    return <input ref={ref} style={{ ...controlStyle, ...style }} {...rest} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ style, ...rest }, ref) {
    return <textarea ref={ref} style={{ ...controlStyle, resize: 'vertical', ...style }} {...rest} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ style, children, ...rest }, ref) {
    return (
      <select ref={ref} style={{ ...controlStyle, appearance: 'none', cursor: 'pointer', paddingRight: 34, ...style }} {...rest}>
        {children}
      </select>
    );
  },
);

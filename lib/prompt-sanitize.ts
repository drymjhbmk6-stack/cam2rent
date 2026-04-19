/**
 * Sanitizer für User-Input, der in LLM-Prompts (System oder User-Turn) eingebaut wird.
 *
 * Ziel: Verhindern, dass User-Input die Rolle der System-Instruction überschreibt
 * ("Ignore previous instructions", injizierte Claude-Turn-Delimiter, etc.).
 *
 * Defense-in-Depth: Die primäre Mitigation ist, User-Content NUR in `messages[].content`
 * (User-Turn) zu packen, nicht in den System-Prompt. Dieser Sanitizer ist zusätzlich.
 */

const MAX_LENGTH_DEFAULT = 500;

// Sequenzen, die in User-Input nichts verloren haben (Anthropic-/OpenAI-Conventions)
const FORBIDDEN_SEQUENCES = [
  /\b(?:ignore|disregard|forget)\s+(?:all|previous|above|prior)\s+(?:instructions?|prompts?|rules?)\b/gi,
  /\bsystem\s*[:>]/gi,
  /\bassistant\s*[:>]/gi,
  /<\|[a-z_]+\|>/gi, // OpenAI-Style Turn-Delimiter
  /\[\[INST\]\]/gi,
  /\[\[\/INST\]\]/gi,
];

export function sanitizePromptInput(input: unknown, maxLength = MAX_LENGTH_DEFAULT): string {
  if (input == null) return '';
  let text = String(input);

  // Backticks neutralisieren (würden Markdown/Code-Blöcke im Prompt öffnen)
  text = text.replace(/```/g, "'''");

  // Injection-Sequenzen durch harmlose Platzhalter ersetzen
  for (const rx of FORBIDDEN_SEQUENCES) {
    text = text.replace(rx, '[entfernt]');
  }

  // Control-Characters raus (ausser \n \t)
  text = text.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');

  // Zu viele Newlines komprimieren
  text = text.replace(/\n{3,}/g, '\n\n');

  // Länge begrenzen
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '…';
  }

  return text.trim();
}

export function sanitizePromptInputList(
  list: unknown,
  maxItems = 20,
  perItemMaxLength = 200,
): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, maxItems)
    .map((item) => sanitizePromptInput(item, perItemMaxLength))
    .filter((s) => s.length > 0);
}

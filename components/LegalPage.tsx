import { getLegalContent } from '@/lib/get-legal-content';
import LegalPageContent from '@/components/LegalPageContent';

interface LegalPageProps {
  slug: string;
  /** Fallback-Titel für Sites die DB-Inhalt nicht laden können (z.B. Build-Time). */
  fallbackTitle: string;
  /** Fallback-Untertitel — derzeit nicht gerendert, aber Teil der API für Aufrufer. */
  fallbackSubtitle?: string;
  fallbackContent: React.ReactNode;
}

/**
 * Server Component: Zeigt ein Rechtsdokument aus der DB an.
 * Fallback auf hardcoded JSX wenn DB-Inhalt nicht verfügbar.
 * Layout entspricht exakt dem bestehenden cam2rent Legal-Seiten-Stil.
 */
export default async function LegalPage({ slug, fallbackContent }: LegalPageProps) {
  const legal = await getLegalContent(slug);

  // Kein DB-Inhalt → Fallback (bestehende hardcoded Seite)
  if (!legal) {
    return <>{fallbackContent}</>;
  }

  // Markdown: H1 entfernen (wird vom Wrapper gesetzt) + Stand-Zeile entfernen
  let content = legal.content;
  // Erste H1-Zeile entfernen
  content = content.replace(/^#\s+.+\n*/m, '');
  // Stand-Zeile entfernen (wird als Untertitel angezeigt)
  content = content.replace(/^\*Stand:.+\*\n*/m, '');
  content = content.replace(/^\*cam2rent\s+–\s+Stand:.+\*\n*/m, '');
  content = content.trim();

  const standText = legal.published_at
    ? `Stand: ${new Date(legal.published_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })}`
    : null;

  return (
    <div className="min-h-screen bg-white dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black dark:text-white mb-2">
          {legal.title}
        </h1>
        {standText && (
          <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-10">
            {standText}
          </p>
        )}

        {/* Nur Markdown-Rendering — kein rohes HTML mehr, um XSS auszuschließen.
            Legacy-HTML-Dokumente fallen auf das hardcoded fallbackContent zurück. */}
        {legal.content_format === 'markdown' ? (
          <LegalPageContent>{content}</LegalPageContent>
        ) : (
          <>{fallbackContent}</>
        )}
      </div>
    </div>
  );
}

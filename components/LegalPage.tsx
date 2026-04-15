import { getLegalContent } from '@/lib/get-legal-content';
import LegalPageContent from '@/components/LegalPageContent';

interface LegalPageProps {
  slug: string;
  fallbackTitle: string;
  fallbackSubtitle?: string;
  fallbackContent: React.ReactNode;
}

/**
 * Server Component: Zeigt ein Rechtsdokument aus der DB an.
 * Fallback auf hardcoded JSX wenn DB-Inhalt nicht verfügbar.
 */
export default async function LegalPage({ slug, fallbackTitle, fallbackSubtitle, fallbackContent }: LegalPageProps) {
  const legal = await getLegalContent(slug);

  // Kein DB-Inhalt → Fallback (bestehende hardcoded Seite)
  if (!legal) {
    return <>{fallbackContent}</>;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="font-heading font-bold text-3xl text-brand-black dark:text-white mb-2">
          {legal.title}
        </h1>
        {legal.published_at && (
          <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-10">
            Stand: {new Date(legal.published_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          </p>
        )}

        {legal.content_format === 'markdown' ? (
          <LegalPageContent>{legal.content}</LegalPageContent>
        ) : (
          <div
            className="prose prose-sm dark:prose-invert max-w-none font-body text-brand-steel"
            dangerouslySetInnerHTML={{ __html: legal.content }}
          />
        )}
      </div>
    </div>
  );
}

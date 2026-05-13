import MarkdownContent from '@/components/MarkdownContent';

interface Props {
  data: { title: string; markdown: string } | null;
}

/**
 * SEO-Textblock am Seitenende der Startseite.
 * Server-rendered, damit Suchmaschinen-Crawler den Inhalt sehen
 * und die Wortanzahl zählt (Ziel: 500+ Wörter Gesamt-Content).
 * Inhalt kommt aus admin_settings.home_seo_text — versteckt sich
 * wenn enabled=false oder leer.
 */
export default function HomeSeoText({ data }: Props) {
  if (!data) return null;

  return (
    <section className="py-12 sm:py-16 bg-brand-bg dark:bg-brand-black border-t border-brand-border/40 dark:border-white/5">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="font-heading font-bold text-2xl sm:text-3xl mb-6 text-brand-black dark:text-white">
          {data.title}
        </h2>
        <div className="font-body text-brand-text dark:text-gray-300">
          <MarkdownContent>{data.markdown}</MarkdownContent>
        </div>
      </div>
    </section>
  );
}

'use client';

import ArticleEditor from '@/components/admin/blog/ArticleEditor';
import AdminBackLink from '@/components/admin/AdminBackLink';

export default function BlogArtikelNeuPage() {
  return (
    <div className="p-4 sm:p-8">
      <AdminBackLink href="/admin/blog/artikel" label="Zurück zu Artikeln" />
      <ArticleEditor />
    </div>
  );
}

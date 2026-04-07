'use client';

import { use } from 'react';
import ArticleEditor from '@/components/admin/blog/ArticleEditor';

export default function BlogArtikelEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ArticleEditor postId={id} />;
}

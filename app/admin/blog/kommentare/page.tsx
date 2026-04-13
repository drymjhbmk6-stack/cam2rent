'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Comment {
  id: string; author_name: string; author_email: string; content: string;
  status: string; created_at: string;
  blog_posts?: { id: string; title: string; slug: string } | null;
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Ausstehend', bg: '#f59e0b20', color: '#f59e0b' },
  approved: { label: 'Genehmigt', bg: '#22c55e20', color: '#22c55e' },
  rejected: { label: 'Abgelehnt', bg: '#ef444420', color: '#ef4444' },
};

export default function BlogKommentarePage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  const loadComments = useCallback(async () => {
    setLoading(true);
    const params = filter !== 'all' ? `?status=${filter}` : '';
    const res = await fetch(`/api/admin/blog/comments${params}`);
    const data = await res.json();
    setComments(data.comments ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadComments(); }, [loadComments]);

  async function updateStatus(id: string, status: string) {
    await fetch('/api/admin/blog/comments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    loadComments();
  }

  async function deleteComment(id: string) {
    if (!confirm('Kommentar wirklich loeschen?')) return;
    await fetch(`/api/admin/blog/comments?id=${id}`, { method: 'DELETE' });
    loadComments();
  }

  return (
    <div className="p-8 max-w-4xl">
      <AdminBackLink href="/admin/blog" label="Zurück zum Blog" />
      <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: 'white' }}>Kommentare</h1>
      <p className="text-sm mb-6" style={{ color: '#64748b' }}>Blog-Kommentare moderieren</p>

      {/* Filter */}
      <div className="flex gap-1 mb-6">
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="px-3 py-2 rounded-lg text-xs font-heading font-semibold transition-colors"
            style={filter === s ? { background: '#06b6d4', color: 'white' } : { background: '#1e293b', color: '#94a3b8' }}
          >
            {s === 'all' ? 'Alle' : STATUS_LABELS[s]?.label ?? s}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#64748b' }} className="text-sm">Laden...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-center py-16" style={{ color: '#475569' }}>Keine Kommentare in dieser Ansicht.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => {
            const s = STATUS_LABELS[c.status] ?? STATUS_LABELS.pending;
            return (
              <div key={c.id} className="rounded-xl p-4" style={{ background: '#1e293b' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-heading font-semibold text-sm" style={{ color: '#e2e8f0' }}>{c.author_name}</span>
                      <span className="text-xs" style={{ color: '#475569' }}>{c.author_email}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-heading" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                    </div>
                    {c.blog_posts && (
                      <p className="text-xs mb-2" style={{ color: '#06b6d4' }}>zu: {c.blog_posts.title}</p>
                    )}
                    <p className="text-sm" style={{ color: '#cbd5e1' }}>{c.content}</p>
                    <p className="text-xs mt-2" style={{ color: '#475569' }}>{new Date(c.created_at).toLocaleString('de-DE')}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {c.status !== 'approved' && (
                      <button onClick={() => updateStatus(c.id, 'approved')} className="px-3 py-1 rounded text-xs font-heading font-semibold" style={{ background: '#22c55e20', color: '#22c55e' }}>
                        Genehmigen
                      </button>
                    )}
                    {c.status !== 'rejected' && (
                      <button onClick={() => updateStatus(c.id, 'rejected')} className="px-3 py-1 rounded text-xs font-heading font-semibold" style={{ background: '#f59e0b20', color: '#f59e0b' }}>
                        Ablehnen
                      </button>
                    )}
                    <button onClick={() => deleteComment(c.id)} className="px-3 py-1 rounded text-xs font-heading font-semibold" style={{ background: '#ef444420', color: '#ef4444' }}>
                      Loeschen
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

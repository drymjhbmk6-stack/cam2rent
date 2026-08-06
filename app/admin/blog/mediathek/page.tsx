'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/ui';
import { useConfirm } from '@/components/admin/ui/FeedbackProvider';

interface MediaImage {
  name: string;
  url: string;
  size: number;
  created_at: string;
}

export default function BlogMediathekPage() {
  const confirm = useConfirm();
  const [images, setImages] = useState<MediaImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { loadImages(); }, []);

  async function loadImages() {
    setLoading(true);
    const res = await fetch('/api/admin/blog/media');
    const data = await res.json();
    setImages(data.images ?? []);
    setLoading(false);
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg('');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/admin/blog/media', { method: 'POST', body: formData });
    const data = await res.json();
    setUploading(false);
    if (res.ok) {
      setMsg('Bild hochgeladen!');
      loadImages();
    } else {
      setMsg(data.error || 'Upload fehlgeschlagen.');
    }
    setTimeout(() => setMsg(''), 3000);
    e.target.value = '';
  }

  async function deleteImage(name: string) {
    const ok = await confirm({ title: 'Bild löschen', message: 'Bild wirklich löschen?', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    await fetch(`/api/admin/blog/media?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (selected === name) setSelected(null);
    loadImages();
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setMsg('URL kopiert!');
    setTimeout(() => setMsg(''), 2000);
  }

  function formatSize(bytes: number) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        backHref="/admin/blog"
        backLabel="Zurück zum Blog"
        title="Mediathek"
        subtitle={`${images.length} Bilder im Blog-Speicher`}
        actions={
          <label className="px-4 py-2 rounded-lg text-sm font-heading font-semibold cursor-pointer flex items-center gap-2" style={{ background: 'var(--admin-accent)', color: '#fff' }}>
            {uploading ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Laden...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Bild hochladen</>
            )}
            <input type="file" accept="image/*" onChange={uploadFile} className="hidden" />
          </label>
        }
      />

      {msg && (
        <div className="mb-4 px-4 py-2 rounded-lg text-sm font-heading" style={{ background: 'var(--admin-input-bg)', color: msg.includes('fehlgeschlagen') ? 'var(--admin-danger)' : '#22c55e' }}>
          {msg}
        </div>
      )}

      {/* Ausgewähltes Bild Detail */}
      {selected && (
        <div className="mb-6 rounded-xl p-4 flex flex-col sm:flex-row gap-4" style={{ background: 'var(--admin-surface-2)', border: '1px solid var(--admin-accent-soft)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images.find((i) => i.name === selected)?.url} alt="" className="w-full sm:w-48 h-32 object-cover rounded-lg" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-heading font-semibold mb-1" style={{ color: 'var(--admin-text)' }}>{selected}</p>
            <p className="text-xs mb-3 break-all" style={{ color: 'var(--admin-accent)' }}>{images.find((i) => i.name === selected)?.url}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copyUrl(images.find((i) => i.name === selected)?.url ?? '')} className="px-3 py-1.5 rounded text-xs font-heading font-semibold" style={{ background: 'var(--admin-accent)', color: 'var(--admin-primary-text)' }}>
                URL kopieren
              </button>
              <button onClick={() => deleteImage(selected)} className="px-3 py-1.5 rounded text-xs font-heading font-semibold" style={{ background: '#ef444420', color: '#ef4444' }}>
                Löschen
              </button>
              <button onClick={() => setSelected(null)} className="px-3 py-1.5 rounded text-xs font-heading font-semibold" style={{ background: 'var(--admin-faint)', color: 'var(--admin-muted)' }}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bilder-Grid */}
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--admin-text-dim)' }}>Laden...</p>
      ) : images.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: 'var(--admin-muted-2)' }}>Noch keine Bilder vorhanden.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {images.map((img) => (
            <button
              key={img.name}
              onClick={() => setSelected(selected === img.name ? null : img.name)}
              className="group relative rounded-xl overflow-hidden transition-all"
              style={{
                border: selected === img.name ? '2px solid var(--admin-accent)' : '2px solid transparent',
                background: 'var(--admin-surface-2)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.name} className="w-full h-28 sm:h-32 object-cover group-hover:scale-105 transition-transform duration-200" />
              <div className="px-2 py-2">
                <p className="text-[10px] font-body truncate" style={{ color: 'var(--admin-muted)' }}>{img.name}</p>
                <p className="text-[10px] font-body" style={{ color: 'var(--admin-muted-2)' }}>{formatSize(img.size)}</p>
              </div>
              {selected === img.name && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--admin-accent)' }}>
                  <svg className="w-3 h-3" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

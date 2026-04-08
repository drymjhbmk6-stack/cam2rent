'use client';

import { useState, useEffect, useMemo } from 'react';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%',
};
const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 4 };

interface FoundLink {
  text: string;
  url: string;
  fullMatch: string;
  index: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
}

export default function LinkManager({ content, onUpdateContent }: { content: string; onUpdateContent: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingLink, setEditingLink] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [newText, setNewText] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [showProducts, setShowProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Links im Content finden
  const links = useMemo<FoundLink[]>(() => {
    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const found: FoundLink[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      found.push({ text: match[1], url: match[2], fullMatch: match[0], index: match.index });
    }
    return found;
  }, [content]);

  // Produkte laden
  useEffect(() => {
    if (expanded && products.length === 0) {
      fetch('/api/products')
        .then((r) => r.json())
        .then((d) => {
          const prods = (d.products ?? d ?? []).map((p: { id: string; name: string; slug: string }) => ({
            id: p.id, name: p.name, slug: p.slug,
          }));
          setProducts(prods);
        })
        .catch(() => {});
    }
  }, [expanded, products.length]);

  function startEdit(i: number) {
    setEditingLink(i);
    setEditText(links[i].text);
    setEditUrl(links[i].url);
  }

  function saveEdit() {
    if (editingLink === null) return;
    const link = links[editingLink];
    const newLink = `[${editText}](${editUrl})`;
    onUpdateContent(content.replace(link.fullMatch, newLink));
    setEditingLink(null);
  }

  function deleteLink(i: number) {
    const link = links[i];
    // Link entfernen, nur den Text behalten
    onUpdateContent(content.replace(link.fullMatch, link.text));
  }

  function insertLink() {
    if (!newText.trim() || !newUrl.trim()) return;
    const link = `[${newText}](${newUrl})`;
    // Am Ende des Contents einfuegen — oder der User kopiert es manuell
    onUpdateContent(content + `\n\n${link}`);
    setNewText('');
    setNewUrl('');
  }

  function insertProductLink(product: Product) {
    const link = `[${product.name}](/kameras/${product.slug})`;
    onUpdateContent(content + `\n\n${link}`);
    setShowProducts(false);
    setProductSearch('');
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="rounded-xl" style={{ background: '#1e293b', border: '1px solid #334155' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="#06b6d4" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span className="font-heading font-semibold text-sm" style={{ color: '#e2e8f0' }}>
            Links verwalten
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#06b6d420', color: '#06b6d4' }}>
            {links.length}
          </span>
        </div>
        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="#64748b" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid #334155' }}>
          {/* Bestehende Links */}
          {links.length > 0 && (
            <div className="pt-3">
              <label style={labelStyle} className="block mb-2">Links im Artikel ({links.length})</label>
              <div className="space-y-2">
                {links.map((link, i) => (
                  <div key={i}>
                    {editingLink === i ? (
                      <div className="p-3 rounded-lg space-y-2" style={{ background: '#0f172a' }}>
                        <input style={inputStyle} value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="Link-Text" />
                        <input style={inputStyle} value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="URL" />
                        <div className="flex gap-2">
                          <button onClick={saveEdit} className="px-3 py-1 rounded text-xs font-heading font-semibold" style={{ background: '#06b6d4', color: '#0f172a' }}>Speichern</button>
                          <button onClick={() => setEditingLink(null)} className="px-3 py-1 rounded text-xs font-heading font-semibold" style={{ background: '#334155', color: '#94a3b8' }}>Abbrechen</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: '#0f172a' }}>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-heading font-semibold truncate block" style={{ color: '#e2e8f0' }}>{link.text}</span>
                          <span className="text-[11px] truncate block" style={{ color: '#06b6d4' }}>{link.url}</span>
                        </div>
                        <div className="flex gap-1 ml-2 shrink-0">
                          <button onClick={() => startEdit(i)} className="px-2 py-1 rounded text-[11px] font-heading font-semibold" style={{ background: '#334155', color: '#94a3b8' }}>Bearbeiten</button>
                          <button onClick={() => deleteLink(i)} className="px-2 py-1 rounded text-[11px] font-heading font-semibold" style={{ background: '#ef444420', color: '#ef4444' }}>Entfernen</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Neuen Link einfuegen */}
          <div className="pt-2" style={{ borderTop: '1px solid #334155' }}>
            <label style={labelStyle} className="block mb-2">Neuen Link einfuegen</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <input style={inputStyle} value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Link-Text (z.B. GoPro Hero 13)" />
              <input style={inputStyle} value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="URL (z.B. /kameras/gopro-hero-13)" />
            </div>
            <div className="flex gap-2">
              <button onClick={insertLink} disabled={!newText.trim() || !newUrl.trim()} className="px-3 py-1.5 rounded text-xs font-heading font-semibold disabled:opacity-30" style={{ background: '#06b6d4', color: '#0f172a' }}>
                Link einfuegen
              </button>
              <button onClick={() => setShowProducts(!showProducts)} className="px-3 py-1.5 rounded text-xs font-heading font-semibold" style={{ background: '#334155', color: '#e2e8f0' }}>
                {showProducts ? 'Schliessen' : 'Produkt verlinken'}
              </button>
            </div>
          </div>

          {/* Produkt-Auswahl */}
          {showProducts && (
            <div className="p-3 rounded-lg" style={{ background: '#0f172a' }}>
              <input
                style={inputStyle}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Produkt suchen..."
                className="mb-2"
              />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs py-2 text-center" style={{ color: '#475569' }}>
                    {products.length === 0 ? 'Produkte werden geladen...' : 'Keine Produkte gefunden.'}
                  </p>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => insertProductLink(p)}
                      className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-white/5 transition-colors"
                    >
                      <span className="font-heading font-semibold" style={{ color: '#e2e8f0' }}>{p.name}</span>
                      <span style={{ color: '#475569' }}>/kameras/{p.slug}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

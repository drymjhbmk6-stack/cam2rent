'use client';

import { useEffect, useState, useRef } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Conversation {
  id: string;
  customer_id: string | null;
  subject: string;
  booking_id: string | null;
  last_message_at: string;
  closed: boolean;
  source: 'account' | 'email';
  inbox_address?: string | null;
  unread_count: number;
  customer: { full_name: string; email: string };
  last_message: { body: string; sender_type: string; created_at: string } | null;
}

interface MessageAttachment {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
}

interface Message {
  id: string;
  sender_type: 'customer' | 'admin';
  body: string;
  body_html?: string | null;
  read: boolean;
  created_at: string;
  attachments?: MessageAttachment[];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `vor ${hrs} Std.`;
  const days = Math.floor(hrs / 24);
  return `vor ${days}d`;
}

type FilterType = 'all' | 'unread' | 'closed';

export default function AdminNachrichtenPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [convInfo, setConvInfo] = useState<{ subject: string; closed: boolean; source?: 'account' | 'email'; inbox_address?: string | null; customer: { full_name: string; email: string } } | null>(null);
  const [htmlOpen, setHtmlOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Bulk-Auswahl: Set von Konversations-IDs.
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Mobile-Layout-Switch: unter 768px nur Liste ODER Detail anzeigen, dazwischen
  // per Zurueck-Button wechseln. Auf Desktop bleibt das alte Side-by-Side.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    fetch('/api/admin/nachrichten')
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setMsgLoading(true);
    setHtmlOpen({});
    fetch(`/api/admin/nachrichten/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages || []);
        setConvInfo(d.conversation || null);
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
        );
      })
      .catch(() => {})
      .finally(() => setMsgLoading(false));
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleReply = async () => {
    if (!replyText.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/nachrichten/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { id: data.message_id, sender_type: 'admin', body: replyText, read: false, created_at: new Date().toISOString() },
        ]);
        setReplyText('');
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? { ...c, last_message_at: new Date().toISOString(), last_message: { body: replyText.substring(0, 100), sender_type: 'admin', created_at: new Date().toISOString() } }
              : c
          )
        );
      }
    } catch {} finally {
      setSending(false);
    }
  };

  const handleToggleClose = async () => {
    if (!selectedId || !convInfo) return;
    const newClosed = !convInfo.closed;
    await fetch(`/api/admin/nachrichten/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closed: newClosed }),
    });
    setConvInfo((prev) => prev ? { ...prev, closed: newClosed } : prev);
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, closed: newClosed } : c))
    );
  };

  const handleDeleteSingle = async () => {
    if (!selectedId) return;
    if (!window.confirm('Diese Konversation endgültig aus der Inbox entfernen?')) return;
    const id = selectedId;
    const res = await fetch(`/api/admin/nachrichten/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      window.alert('Löschen fehlgeschlagen.');
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setSelection((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSelectedId(null);
    setMessages([]);
    setConvInfo(null);
  };

  const toggleSelection = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = (ids: string[]) => {
    setSelection(new Set(ids));
  };

  const clearSelection = () => setSelection(new Set());

  const handleBulkDelete = async () => {
    if (selection.size === 0 || bulkBusy) return;
    if (!window.confirm(`${selection.size} Konversation${selection.size !== 1 ? 'en' : ''} endgültig löschen?`)) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selection);
      const res = await fetch('/api/admin/nachrichten/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids }),
      });
      if (!res.ok) {
        window.alert('Bulk-Löschen fehlgeschlagen.');
        return;
      }
      const deletedSet = new Set(ids);
      setConversations((prev) => prev.filter((c) => !deletedSet.has(c.id)));
      if (selectedId && deletedSet.has(selectedId)) {
        setSelectedId(null);
        setMessages([]);
        setConvInfo(null);
      }
      setSelection(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const filtered = conversations.filter((c) => {
    if (filter === 'unread') return c.unread_count > 0;
    if (filter === 'closed') return c.closed;
    return true;
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  const cardStyle: React.CSSProperties = { background: '#111827', border: '1px solid #1e293b', borderRadius: 12 };
  const inputStyle: React.CSSProperties = { background: '#0f172a', border: '1px solid #334155', borderRadius: 10, color: '#e2e8f0', padding: '10px 16px', fontSize: 14, outline: 'none', width: '100%' };

  return (
    <div style={{ padding: '24px 20px' }}>
      <AdminBackLink label="Zurück" />
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Nachrichten</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            {totalUnread > 0 ? `${totalUnread} ungelesene Nachricht${totalUnread !== 1 ? 'en' : ''}` : 'Alle Kundennachrichten'}
          </p>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 4, background: '#0f172a', borderRadius: 10, padding: 3 }}>
          {(['all', 'unread', 'closed'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: filter === f ? '#1e293b' : 'transparent',
                color: filter === f ? '#22d3ee' : '#64748b',
              }}
            >
              {f === 'all' ? 'Alle' : f === 'unread' ? 'Ungelesen' : 'Geschlossen'}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk-Bar: sichtbar sobald mindestens eine Konversation markiert ist. */}
      {selection.size > 0 && (
        <div
          style={{
            position: 'sticky', top: 0, zIndex: 20,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #334155',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          }}
        >
          <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
            {selection.size} ausgewählt
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              style={{
                padding: '6px 12px', background: '#dc2626', color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: bulkBusy ? 'wait' : 'pointer', opacity: bulkBusy ? 0.6 : 1,
              }}
            >
              🗑 Löschen
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={bulkBusy}
              style={{
                padding: '6px 12px', background: 'transparent', color: '#cbd5e1',
                border: '1px solid #334155', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Auswahl aufheben
            </button>
          </div>
        </div>
      )}

      {/* Layout: Side-by-Side auf Desktop, gestapelter Switch list↔detail auf Mobile. */}
      <div style={{ ...cardStyle, display: 'flex', minHeight: 520, overflow: 'hidden' }}>
        {/* Conversation list */}
        <div
          style={{
            width: isMobile ? '100%' : 320,
            flexShrink: 0,
            borderRight: isMobile ? 'none' : '1px solid #1e293b',
            overflowY: 'auto',
            maxHeight: isMobile ? 'none' : 580,
            // Auf Mobile: Liste nur sichtbar, solange keine Konversation geoeffnet ist.
            display: isMobile && selectedId ? 'none' : 'block',
          }}
        >
          {/* Auf Mobile: kleine "Auswahl" / "Alle markieren"-Leiste oben in der Liste. */}
          {!loading && filtered.length > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '8px 14px',
                borderBottom: '1px solid #1e293b',
                fontSize: 11, color: '#64748b',
              }}
            >
              <span>{filtered.length} Konversation{filtered.length !== 1 ? 'en' : ''}</span>
              <button
                type="button"
                onClick={() => {
                  const allIds = filtered.map((c) => c.id);
                  const allSelected = allIds.every((id) => selection.has(id));
                  if (allSelected) clearSelection();
                  else selectAllVisible(allIds);
                }}
                style={{
                  background: 'transparent', border: 'none', color: '#06b6d4',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0,
                }}
              >
                {filtered.every((c) => selection.has(c.id)) ? 'Auswahl aufheben' : 'Alle auswählen'}
              </button>
            </div>
          )}
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ width: 20, height: 20, border: '2px solid #06b6d4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Keine Nachrichten.
            </div>
          ) : (
            filtered.map((conv) => (
              <div
                key={conv.id}
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'flex-start',
                  borderBottom: '1px solid #1e293b',
                  borderLeft: selectedId === conv.id ? '3px solid #06b6d4' : '3px solid transparent',
                  background: selectedId === conv.id ? 'rgba(6,182,212,0.08)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Bulk-Checkbox — stopPropagation, damit Klick die Konversation
                    nicht oeffnet. Eigene Touch-Zone fuer Mobile breit genug. */}
                <label
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    paddingLeft: 12, paddingRight: 4, alignSelf: 'stretch', cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selection.has(conv.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelection(conv.id); }}
                    style={{ width: 16, height: 16, accentColor: '#06b6d4', cursor: 'pointer' }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  style={{
                    flex: 1, minWidth: 0,
                    display: 'block', textAlign: 'left', padding: '14px 16px 14px 8px',
                    cursor: 'pointer', border: 'none', background: 'transparent', color: 'inherit',
                  }}
                  onMouseEnter={(e) => { if (selectedId !== conv.id) (e.currentTarget.parentElement as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={(e) => { if (selectedId !== conv.id) (e.currentTarget.parentElement as HTMLElement).style.background = 'transparent'; }}
                >
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        flexShrink: 0, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        ...(conv.source === 'email'
                          ? { background: '#0ea5e91f', color: '#38bdf8' }
                          : { background: '#6366f11f', color: '#a5b4fc' }),
                      }}>
                        {conv.source === 'email' ? '📧 E-Mail' : '💬 Konto'}
                      </span>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.customer.full_name}
                      </p>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.subject}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: '#475569' }}>{timeAgo(conv.last_message_at)}</span>
                    {conv.unread_count > 0 && (
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#06b6d4', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
                {conv.last_message && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.last_message.sender_type === 'admin' ? 'Du: ' : ''}
                    {conv.last_message.body}
                  </p>
                )}
                {conv.closed && (
                  <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, color: '#64748b', background: '#1e293b', padding: '2px 6px', borderRadius: 4 }}>
                    Geschlossen
                  </span>
                )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Chat area — auf Mobile nur sichtbar wenn eine Konversation gewaehlt ist. */}
        <div
          style={{
            flex: 1, display: isMobile && !selectedId ? 'none' : 'flex',
            flexDirection: 'column', minWidth: 0,
          }}
        >
          {selectedId && convInfo ? (
            <>
              {/* Chat header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: 1 }}>
                  {/* Mobile: Zurueck-Pfeil schliesst die Detail-Ansicht und zeigt die Liste wieder. */}
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => { setSelectedId(null); setMessages([]); setConvInfo(null); }}
                      aria-label="Zurück zur Liste"
                      style={{
                        background: 'transparent', border: 'none', color: '#06b6d4',
                        cursor: 'pointer', padding: '4px 2px', fontSize: 22, lineHeight: 1, flexShrink: 0,
                      }}
                    >
                      ←
                    </button>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        ...(convInfo.source === 'email'
                          ? { background: '#0ea5e91f', color: '#38bdf8' }
                          : { background: '#6366f11f', color: '#a5b4fc' }),
                      }}>
                        {convInfo.source === 'email' ? '📧 E-Mail' : '💬 Konto'}
                      </span>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{convInfo.subject}</p>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
                      {convInfo.customer.full_name}
                      {convInfo.customer.email ? ` · ${convInfo.customer.email}` : ''}
                      {convInfo.inbox_address ? ` · an: ${convInfo.inbox_address}` : ''}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleToggleClose}
                    style={{
                      padding: '6px 12px', borderRadius: 6, border: '1px solid #334155', cursor: 'pointer',
                      background: 'transparent', color: convInfo.closed ? '#10b981' : '#f59e0b', fontSize: 11, fontWeight: 600,
                    }}
                  >
                    {convInfo.closed ? 'Wiedereröffnen' : 'Schließen'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSingle}
                    title="Konversation aus Inbox entfernen"
                    style={{
                      padding: '6px 12px', borderRadius: 6, border: '1px solid #7f1d1d', cursor: 'pointer',
                      background: 'transparent', color: '#fca5a5', fontSize: 11, fontWeight: 600,
                    }}
                  >
                    🗑 Löschen
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, maxHeight: 380 }}>
                {msgLoading ? (
                  <div style={{ textAlign: 'center', padding: 32 }}>
                    <div style={{ width: 20, height: 20, border: '2px solid #06b6d4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {messages.map((msg) => (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender_type === 'admin' ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '75%', padding: '10px 14px', borderRadius: 16, fontSize: 13,
                          ...(msg.sender_type === 'admin'
                            ? { background: '#06b6d4', color: '#fff', borderBottomRightRadius: 4 }
                            : { background: '#1e293b', color: '#e2e8f0', borderBottomLeftRadius: 4 }
                          ),
                        }}>
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.body}</p>

                          {msg.body_html && (
                            <div style={{ marginTop: 6 }}>
                              <button
                                onClick={() => setHtmlOpen((p) => ({ ...p, [msg.id]: !p[msg.id] }))}
                                style={{
                                  background: 'transparent', border: '1px solid currentColor', borderRadius: 6,
                                  color: 'inherit', fontSize: 10, fontWeight: 600, padding: '3px 8px',
                                  cursor: 'pointer', opacity: 0.85,
                                }}
                              >
                                {htmlOpen[msg.id] ? 'HTML-Ansicht ausblenden' : 'HTML-Ansicht anzeigen'}
                              </button>
                              {htmlOpen[msg.id] && (
                                <iframe
                                  // Sandbox ohne allow-scripts/allow-same-origin: neutralisiert
                                  // eingebettetes JS in der eingegangenen E-Mail.
                                  sandbox=""
                                  srcDoc={msg.body_html}
                                  title="E-Mail-HTML"
                                  style={{
                                    marginTop: 6, width: '100%', minWidth: 320, height: 360,
                                    border: 'none', borderRadius: 8, background: '#fff',
                                  }}
                                />
                              )}
                            </div>
                          )}

                          {msg.attachments && msg.attachments.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {msg.attachments.map((att) => (
                                <a
                                  key={att.id}
                                  href={`/api/admin/message-attachment-url?id=${att.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                                    color: 'inherit', textDecoration: 'underline', opacity: 0.9,
                                  }}
                                >
                                  📎 {att.filename}
                                  {att.size_bytes != null && (
                                    <span style={{ opacity: 0.6 }}>
                                      ({Math.round(att.size_bytes / 1024)} KB)
                                    </span>
                                  )}
                                </a>
                              ))}
                            </div>
                          )}

                          <p style={{ margin: '4px 0 0', fontSize: 10, opacity: 0.7 }}>
                            {new Date(msg.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Reply input */}
              {!convInfo.closed && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid #1e293b', display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder={convInfo.source === 'email' ? 'E-Mail-Antwort schreiben...' : 'Antwort schreiben...'}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
                    style={inputStyle}
                    maxLength={5000}
                  />
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim() || sending}
                    style={{
                      padding: '10px 16px', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 10,
                      cursor: replyText.trim() && !sending ? 'pointer' : 'not-allowed',
                      opacity: replyText.trim() && !sending ? 1 : 0.4, flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 13 }}>
              Wähle eine Konversation aus der Liste.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

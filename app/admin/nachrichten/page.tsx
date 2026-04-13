'use client';

import { useEffect, useState, useRef } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Conversation {
  id: string;
  customer_id: string;
  subject: string;
  booking_id: string | null;
  last_message_at: string;
  closed: boolean;
  unread_count: number;
  customer: { full_name: string; email: string };
  last_message: { body: string; sender_type: string; created_at: string } | null;
}

interface Message {
  id: string;
  sender_type: 'customer' | 'admin';
  body: string;
  read: boolean;
  created_at: string;
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
  const [convInfo, setConvInfo] = useState<{ subject: string; closed: boolean; customer: { full_name: string; email: string } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

      <div style={{ ...cardStyle, display: 'flex', minHeight: 520, overflow: 'hidden' }}>
        {/* Conversation list */}
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #1e293b', overflowY: 'auto', maxHeight: 580 }}>
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
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px',
                  borderBottom: '1px solid #1e293b', cursor: 'pointer', border: 'none',
                  borderLeft: selectedId === conv.id ? '3px solid #06b6d4' : '3px solid transparent',
                  background: selectedId === conv.id ? 'rgba(6,182,212,0.08)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (selectedId !== conv.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={(e) => { if (selectedId !== conv.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.customer.full_name}
                    </p>
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
            ))
          )}
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {selectedId && convInfo ? (
            <>
              {/* Chat header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{convInfo.subject}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
                    {convInfo.customer.full_name} &middot; {convInfo.customer.email}
                  </p>
                </div>
                <button
                  onClick={handleToggleClose}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: '1px solid #334155', cursor: 'pointer',
                    background: 'transparent', color: convInfo.closed ? '#10b981' : '#f59e0b', fontSize: 11, fontWeight: 600,
                  }}
                >
                  {convInfo.closed ? 'Wiedereröffnen' : 'Schließen'}
                </button>
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
                    placeholder="Antwort schreiben..."
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

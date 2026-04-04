'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';

interface Conversation {
  id: string;
  subject: string;
  booking_id: string | null;
  last_message_at: string;
  closed: boolean;
  unread_count: number;
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
  return `vor ${days} Tag${days !== 1 ? 'en' : ''}`;
}

export default function NachrichtenPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [convInfo, setConvInfo] = useState<{ subject: string; closed: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newSending, setNewSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    fetch('/api/messages')
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedId) return;
    setMsgLoading(true);
    fetch(`/api/messages/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages || []);
        setConvInfo(d.conversation || null);
        // Update unread count
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
        );
      })
      .catch(() => {})
      .finally(() => setMsgLoading(false));
  }, [selectedId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: data.message_id,
            sender_type: 'customer',
            body: replyText,
            read: false,
            created_at: new Date().toISOString(),
          },
        ]);
        setReplyText('');
        // Update conversation list
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? { ...c, last_message_at: new Date().toISOString(), last_message: { body: replyText.substring(0, 100), sender_type: 'customer', created_at: new Date().toISOString() } }
              : c
          )
        );
      }
    } catch {
      setError('Nachricht konnte nicht gesendet werden.');
    } finally {
      setSending(false);
    }
  };

  const handleNewConversation = async () => {
    if (!newSubject.trim() || !newBody.trim() || newSending) return;
    setNewSending(true);
    setError('');
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: newSubject, body: newBody }),
      });
      if (res.ok) {
        const data = await res.json();
        const newConv: Conversation = {
          id: data.conversation_id,
          subject: newSubject,
          booking_id: null,
          last_message_at: new Date().toISOString(),
          closed: false,
          unread_count: 0,
          last_message: { body: newBody.substring(0, 100), sender_type: 'customer', created_at: new Date().toISOString() },
        };
        setConversations((prev) => [newConv, ...prev]);
        setSelectedId(data.conversation_id);
        setShowNew(false);
        setNewSubject('');
        setNewBody('');
      } else {
        const d = await res.json();
        setError(d.error || 'Fehler beim Erstellen.');
      }
    } catch {
      setError('Nachricht konnte nicht gesendet werden.');
    } finally {
      setNewSending(false);
    }
  };

  if (!user) {
    return (
      <div className="bg-white rounded-card shadow-card p-8 text-center">
        <p className="text-brand-steel text-sm">Bitte melde dich an.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-xl text-brand-black">Nachrichten</h1>
          <p className="text-sm text-brand-steel mt-1">Schreibe uns eine Nachricht</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setSelectedId(null); }}
          className="px-4 py-2 bg-brand-black text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors"
        >
          Neue Nachricht
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-[10px] bg-red-50 border border-red-200 text-status-error text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-card shadow-card overflow-hidden" style={{ minHeight: 480 }}>
        <div className="flex" style={{ minHeight: 480 }}>
          {/* Conversation list */}
          <div className="w-full sm:w-72 flex-shrink-0 border-r border-brand-border overflow-y-auto" style={{ maxHeight: 560 }}>
            {loading ? (
              <div className="p-6 text-center">
                <div className="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : conversations.length === 0 && !showNew ? (
              <div className="p-6 text-center text-sm text-brand-steel">
                Noch keine Nachrichten.
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => { setSelectedId(conv.id); setShowNew(false); }}
                  className={`w-full text-left px-4 py-3 border-b border-brand-border transition-colors ${
                    selectedId === conv.id ? 'bg-accent-blue-soft' : 'hover:bg-brand-bg'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-heading font-semibold text-sm text-brand-black truncate flex-1">
                      {conv.subject}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-blue text-white text-xs font-bold flex items-center justify-center">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  {conv.last_message && (
                    <p className="text-xs text-brand-steel line-clamp-1 mt-1">
                      {conv.last_message.sender_type === 'admin' ? 'cam2rent: ' : 'Du: '}
                      {conv.last_message.body}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-brand-muted">{timeAgo(conv.last_message_at)}</span>
                    {conv.closed && (
                      <span className="text-xs text-brand-muted bg-brand-bg px-1.5 py-0.5 rounded">Geschlossen</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0 hidden sm:flex">
            {showNew ? (
              /* New conversation form */
              <div className="flex-1 p-6 space-y-4">
                <h2 className="font-heading font-semibold text-brand-black">Neue Nachricht</h2>
                <input
                  type="text"
                  placeholder="Betreff..."
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-sm"
                  maxLength={200}
                />
                <textarea
                  placeholder="Deine Nachricht..."
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-sm resize-none"
                  maxLength={5000}
                />
                <button
                  onClick={handleNewConversation}
                  disabled={!newSubject.trim() || !newBody.trim() || newSending}
                  className="px-6 py-2.5 bg-brand-black text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {newSending ? 'Wird gesendet...' : 'Absenden'}
                </button>
              </div>
            ) : selectedId && convInfo ? (
              /* Message thread */
              <>
                {/* Header */}
                <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between">
                  <div>
                    <h2 className="font-heading font-semibold text-sm text-brand-black">{convInfo.subject}</h2>
                    {convInfo.closed && (
                      <span className="text-xs text-brand-muted">Geschlossen</span>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ maxHeight: 400 }}>
                  {msgLoading ? (
                    <div className="text-center py-8">
                      <div className="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                            msg.sender_type === 'customer'
                              ? 'bg-accent-blue text-white rounded-br-md'
                              : 'bg-brand-bg text-brand-black rounded-bl-md'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                          <p className={`text-xs mt-1 ${msg.sender_type === 'customer' ? 'text-blue-200' : 'text-brand-muted'}`}>
                            {new Date(msg.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply input */}
                {!convInfo.closed && (
                  <div className="px-5 py-3 border-t border-brand-border flex gap-2">
                    <input
                      type="text"
                      placeholder="Nachricht schreiben..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendReply()}
                      className="flex-1 px-4 py-2.5 rounded-[10px] border border-brand-border bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-sm"
                      maxLength={5000}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sending}
                      className="px-4 py-2.5 bg-brand-black text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* No selection */
              <div className="flex-1 flex items-center justify-center text-brand-muted text-sm">
                Wähle eine Konversation aus oder starte eine neue Nachricht.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

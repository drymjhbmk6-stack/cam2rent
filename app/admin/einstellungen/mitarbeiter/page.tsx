'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

const PERMISSION_KEYS = [
  'tagesgeschaeft',
  'kunden',
  'katalog',
  'preise',
  'content',
  'finanzen',
  'berichte',
  'system',
  'mitarbeiter_verwalten',
] as const;
type PermissionKey = (typeof PERMISSION_KEYS)[number];

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  tagesgeschaeft: 'Tagesgeschäft',
  kunden: 'Kunden & Kommunikation',
  katalog: 'Katalog',
  preise: 'Preise & Aktionen',
  content: 'Content (Blog, Social)',
  finanzen: 'Finanzen (Buchhaltung)',
  berichte: 'Berichte & Protokolle',
  system: 'System (Rechtstexte, Einstellungen)',
  mitarbeiter_verwalten: 'Mitarbeiter verwalten',
};

const PERMISSION_HINTS: Record<PermissionKey, string> = {
  tagesgeschaeft: 'Buchungen, Kalender, Versand, Retouren, Schäden',
  kunden: 'Kunden, Anfragen, Bewertungen, Warteliste',
  katalog: 'Kameras, Sets, Zubehör, Einkauf',
  preise: 'Versand/Haftung, Gutscheine, Rabatte',
  content: 'Startseite, Blog, Social Media, Reels',
  finanzen: 'Buchhaltung, Anlagenverzeichnis',
  berichte: 'Statistiken, E-Mails, Admin-Protokoll, Feedback',
  system: 'Rechtstexte, Systemeinstellungen, 2FA',
  mitarbeiter_verwalten: 'Accounts anlegen, Rechte vergeben (nur für Vertrauenspersonen)',
};

interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: 'owner' | 'employee';
  permissions: PermissionKey[];
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Berlin',
    });
  } catch {
    return iso;
  }
}

export default function MitarbeiterPage() {
  const [me, setMe] = useState<AdminUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Neu-Formular
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'owner' | 'employee'>('employee');
  const [newPerms, setNewPerms] = useState<PermissionKey[]>([]);
  const [saving, setSaving] = useState(false);

  // Editor-Zustaende pro User
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<'owner' | 'employee'>('employee');
  const [editPerms, setEditPerms] = useState<PermissionKey[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [meRes, listRes] = await Promise.all([
        fetch('/api/admin/me').then((r) => r.json()),
        fetch('/api/admin/employees').then((r) => r.json()),
      ]);
      if (meRes?.user) setMe(meRes.user);
      if (listRes?.users) setUsers(listRes.users);
      else if (listRes?.error) setErr(listRes.error);
    } catch {
      setErr('Fehler beim Laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = me?.role === 'owner' || me?.permissions.includes('mitarbeiter_verwalten');
  const iAmOwner = me?.role === 'owner';

  async function handleCreate() {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          username: newUsername.trim() || null,
          password: newPassword,
          role: newRole,
          permissions: newPerms,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? 'Fehler beim Anlegen.');
        return;
      }
      setShowNew(false);
      setNewName(''); setNewEmail(''); setNewUsername(''); setNewPassword(''); setNewRole('employee'); setNewPerms([]);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(u: AdminUser) {
    setEditingId(u.id);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditUsername(u.username ?? '');
    setEditRole(u.role);
    setEditPerms(u.permissions);
    setEditActive(u.is_active);
    setEditPassword('');
    setErr('');
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    setErr('');
    try {
      const patch: Record<string, unknown> = {
        name: editName,
        email: editEmail,
        username: editUsername.trim() || null,
        role: editRole,
        permissions: editPerms,
        is_active: editActive,
      };
      if (editPassword) patch.password = editPassword;
      const res = await fetch(`/api/admin/employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? 'Fehler beim Speichern.');
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Mitarbeiter "${name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    setErr('');
    const res = await fetch(`/api/admin/employees/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setErr(data?.error ?? 'Fehler beim Löschen.');
      return;
    }
    await load();
  }

  const headerButton = useMemo(() => {
    if (!canManage) return null;
    return (
      <button
        onClick={() => setShowNew((v) => !v)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors"
        style={{ background: '#06b6d4', color: '#0a0a0a' }}
      >
        {showNew ? '× Schließen' : '+ Neuer Mitarbeiter'}
      </button>
    );
  }, [canManage, showNew]);

  if (loading) {
    return (
      <div className="p-8 text-sm" style={{ color: '#94a3b8' }}>Laden…</div>
    );
  }

  if (!canManage) {
    return (
      <div className="p-8 max-w-3xl">
        <AdminBackLink href="/admin/einstellungen" label="Zurück zu Einstellungen" />
        <div className="mt-6 rounded-lg p-6" style={{ background: '#1f2937', color: '#fca5a5', border: '1px solid #b91c1c' }}>
          Du hast keine Berechtigung, Mitarbeiter zu verwalten.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl">
      <AdminBackLink href="/admin/einstellungen" label="Zurück zu Einstellungen" />

      <div className="mt-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-black" style={{ color: '#e2e8f0' }}>Mitarbeiter</h1>
          <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
            Lege Mitarbeiter-Konten an und entscheide pro Person, welche Bereiche sie sehen darf.
          </p>
        </div>
        {headerButton}
      </div>

      {err && (
        <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: '#450a0a', color: '#fecaca', border: '1px solid #b91c1c' }}>
          {err}
        </div>
      )}

      {/* Neu-Formular */}
      {showNew && (
        <div className="mt-6 rounded-lg p-5 space-y-4" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
          <h2 className="text-lg font-heading font-bold" style={{ color: '#e2e8f0' }}>Neuen Mitarbeiter anlegen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Name" value={newName} onChange={setNewName} placeholder="Max Mustermann" />
            <Input label="E-Mail" type="email" value={newEmail} onChange={setNewEmail} placeholder="max@cam2rent.de" />
            <Input label="Benutzername (optional, für kürzeren Login)" value={newUsername} onChange={setNewUsername} placeholder="z.B. max" />
            <Input label="Start-Passwort (mind. 8 Zeichen)" type="text" value={newPassword} onChange={setNewPassword} placeholder="Kann später geändert werden" />
            <div>
              <label className="block text-xs font-heading font-semibold mb-1" style={{ color: '#94a3b8' }}>Rolle</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'owner' | 'employee')}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: '#0a0f1e', color: '#e2e8f0', border: '1px solid #1e293b' }}
                disabled={!iAmOwner}
              >
                <option value="employee">Mitarbeiter</option>
                {iAmOwner && <option value="owner">Owner (alle Rechte)</option>}
              </select>
              {!iAmOwner && (
                <p className="text-xs mt-1" style={{ color: '#64748b' }}>Nur Owner können andere zu Owner ernennen.</p>
              )}
            </div>
          </div>

          <PermissionGrid
            value={newPerms}
            onChange={setNewPerms}
            disabled={newRole === 'owner'}
          />

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleCreate}
              disabled={saving || !newName || !newEmail || newPassword.length < 8}
              className="px-4 py-2 rounded-lg text-sm font-heading font-semibold disabled:opacity-50"
              style={{ background: '#06b6d4', color: '#0a0a0a' }}
            >
              {saving ? 'Speichere…' : 'Anlegen'}
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ color: '#94a3b8', border: '1px solid #334155' }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="mt-8 space-y-3">
        {users.length === 0 && (
          <div className="rounded-lg p-6 text-sm" style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #1e293b' }}>
            Noch keine Mitarbeiter-Konten vorhanden. Klick oben auf „+ Neuer Mitarbeiter“.
            <br />
            <span className="text-xs" style={{ color: '#64748b' }}>
              Der ENV-Admin (über ADMIN_PASSWORD) bleibt als Notfall-Login immer aktiv.
            </span>
          </div>
        )}
        {users.map((u) => (
          <div
            key={u.id}
            className="rounded-lg p-4"
            style={{ background: '#0f172a', border: u.is_active ? '1px solid #1e293b' : '1px dashed #6b7280' }}
          >
            {editingId === u.id ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Name" value={editName} onChange={setEditName} />
                  <Input label="E-Mail" type="email" value={editEmail} onChange={setEditEmail} />
                  <Input label="Benutzername (optional)" value={editUsername} onChange={setEditUsername} placeholder="z.B. max" />
                  <Input
                    label="Neues Passwort (leer lassen = unverändert)"
                    type="text"
                    value={editPassword}
                    onChange={setEditPassword}
                    placeholder="Optional"
                  />
                  <div>
                    <label className="block text-xs font-heading font-semibold mb-1" style={{ color: '#94a3b8' }}>Rolle</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as 'owner' | 'employee')}
                      className="w-full rounded-lg px-3 py-2 text-sm"
                      style={{ background: '#0a0f1e', color: '#e2e8f0', border: '1px solid #1e293b' }}
                      disabled={!iAmOwner}
                    >
                      <option value="employee">Mitarbeiter</option>
                      {iAmOwner && <option value="owner">Owner (alle Rechte)</option>}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm" style={{ color: '#e2e8f0' }}>
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                  Aktiv (inaktive Mitarbeiter können sich nicht anmelden)
                </label>

                <PermissionGrid
                  value={editPerms}
                  onChange={setEditPerms}
                  disabled={editRole === 'owner'}
                />

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => handleUpdate(u.id)}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm font-heading font-semibold disabled:opacity-50"
                    style={{ background: '#06b6d4', color: '#0a0a0a' }}
                  >
                    {saving ? 'Speichere…' : 'Speichern'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ color: '#94a3b8', border: '1px solid #334155' }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-bold text-base" style={{ color: '#e2e8f0' }}>{u.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      background: u.role === 'owner' ? '#7c2d12' : '#1e40af',
                      color: u.role === 'owner' ? '#fed7aa' : '#bfdbfe',
                    }}>
                      {u.role === 'owner' ? 'Owner' : 'Mitarbeiter'}
                    </span>
                    {!u.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#374151', color: '#d1d5db' }}>
                        Inaktiv
                      </span>
                    )}
                  </div>
                  <div className="text-sm mt-1" style={{ color: '#94a3b8' }}>
                    {u.email}
                    {u.username && (
                      <span style={{ color: '#06b6d4', marginLeft: 8 }}>· @{u.username}</span>
                    )}
                  </div>
                  <div className="text-xs mt-2" style={{ color: '#64748b' }}>
                    Letzter Login: {fmtDate(u.last_login_at)} · Angelegt: {fmtDate(u.created_at)}
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {u.role === 'owner' ? (
                      <span className="text-xs px-2 py-1 rounded" style={{ background: '#0c4a6e', color: '#bae6fd' }}>
                        Alle Bereiche
                      </span>
                    ) : u.permissions.length === 0 ? (
                      <span className="text-xs" style={{ color: '#f59e0b' }}>Keine Bereiche freigegeben</span>
                    ) : (
                      u.permissions.map((p) => (
                        <span
                          key={p}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: '#1e293b', color: '#cbd5e1' }}
                        >
                          {PERMISSION_LABELS[p] ?? p}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(u)}
                    className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold"
                    style={{ color: '#06b6d4', border: '1px solid #06b6d4' }}
                  >
                    Bearbeiten
                  </button>
                  {me?.id !== u.id && (
                    <button
                      onClick={() => handleDelete(u.id, u.name)}
                      className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold"
                      style={{ color: '#ef4444', border: '1px solid #ef4444' }}
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg p-4 text-xs" style={{ background: '#0f172a', color: '#64748b', border: '1px solid #1e293b' }}>
        <strong>Hinweis:</strong> Der Login per <code>ADMIN_PASSWORD</code>-ENV bleibt als Notfall-Zugang immer erhalten und hat alle Rechte. Mitarbeiter melden sich mit ihrer E-Mail + Passwort an.
      </div>
    </div>
  );
}

// ============================================================
// Kleine Bausteine
// ============================================================
function Input({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-heading font-semibold mb-1" style={{ color: '#94a3b8' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // text-base (16 px) verhindert iOS-Auto-Zoom beim Fokus
        className="w-full rounded-lg px-3 py-2 text-base"
        style={{ background: '#0a0f1e', color: '#e2e8f0', border: '1px solid #1e293b' }}
      />
    </div>
  );
}

function PermissionGrid({
  value, onChange, disabled,
}: {
  value: PermissionKey[];
  onChange: (next: PermissionKey[]) => void;
  disabled?: boolean;
}) {
  function toggle(p: PermissionKey) {
    onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  }
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <label className="text-xs font-heading font-semibold" style={{ color: '#94a3b8' }}>
          Zugriffsrechte
        </label>
        {disabled && (
          <span className="text-xs" style={{ color: '#f59e0b' }}>
            Owner haben automatisch alle Rechte.
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {PERMISSION_KEYS.map((p) => {
          const active = value.includes(p);
          return (
            <button
              type="button"
              key={p}
              onClick={() => !disabled && toggle(p)}
              disabled={disabled}
              className="text-left rounded-lg p-3 transition-colors"
              style={{
                background: active ? 'rgba(6,182,212,0.1)' : '#0a0f1e',
                border: active ? '1px solid #06b6d4' : '1px solid #1e293b',
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                  style={{
                    borderColor: active ? '#06b6d4' : '#475569',
                    background: active ? '#06b6d4' : 'transparent',
                  }}
                >
                  {active && (
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-heading font-semibold" style={{ color: active ? '#06b6d4' : '#e2e8f0' }}>
                  {PERMISSION_LABELS[p]}
                </span>
              </div>
              <div className="text-xs mt-1 pl-6" style={{ color: '#64748b' }}>
                {PERMISSION_HINTS[p]}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

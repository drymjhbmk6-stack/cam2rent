import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { createServiceClient } from '@/lib/supabase';

const scrypt = promisify(scryptCb) as (pwd: string | Buffer, salt: Buffer, keylen: number) => Promise<Buffer>;

// ============================================================
// Permission-Schluessel (synchron mit supabase-admin-users.sql)
// ============================================================
export const PERMISSION_KEYS = [
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
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  tagesgeschaeft: 'Tagesgeschäft (Buchungen, Kalender, Versand, Retouren, Schäden)',
  kunden: 'Kunden & Kommunikation (Kunden, Anfragen, Bewertungen, Warteliste)',
  katalog: 'Katalog (Kameras, Sets, Zubehör, Einkauf)',
  preise: 'Preise & Aktionen (Versand/Haftung, Gutscheine, Rabatte)',
  content: 'Content (Startseite, Blog, Social Media, Reels)',
  finanzen: 'Finanzen (Buchhaltung, Anlagenverzeichnis)',
  berichte: 'Berichte (Statistiken, E-Mail, Protokolle, Feedback)',
  system: 'System (Rechtstexte, Einstellungen)',
  mitarbeiter_verwalten: 'Mitarbeiter verwalten (Accounts anlegen + Rechte vergeben)',
};

// ============================================================
// Permission-Mapping: Pfad -> benoetigte Permission
// Wird in Middleware + UI-Filter genutzt. Reihenfolge: spezifisch vor generisch.
// ============================================================
type PermRule = { prefix: string; perm: PermissionKey };
const PATH_PERMISSIONS: PermRule[] = [
  // System: Mitarbeiter-Unterseite braucht eigene Permission
  { prefix: '/admin/einstellungen/mitarbeiter', perm: 'mitarbeiter_verwalten' },
  // Tagesgeschaeft
  { prefix: '/admin/buchungen', perm: 'tagesgeschaeft' },
  { prefix: '/admin/verfuegbarkeit', perm: 'tagesgeschaeft' },
  { prefix: '/admin/versand', perm: 'tagesgeschaeft' },
  { prefix: '/admin/retouren', perm: 'tagesgeschaeft' },
  { prefix: '/admin/schaeden', perm: 'tagesgeschaeft' },
  // Kunden — spezifisch vor generisch (kunden-material darf nicht an /admin/kunden haengenbleiben)
  { prefix: '/admin/kunden-material', perm: 'kunden' },
  { prefix: '/admin/kunden', perm: 'kunden' },
  { prefix: '/admin/nachrichten', perm: 'kunden' },
  { prefix: '/admin/bewertungen', perm: 'kunden' },
  { prefix: '/admin/warteliste', perm: 'kunden' },
  // Katalog
  { prefix: '/admin/preise/kameras', perm: 'katalog' },
  { prefix: '/admin/sets', perm: 'katalog' },
  { prefix: '/admin/zubehoer', perm: 'katalog' },
  { prefix: '/admin/einkauf', perm: 'katalog' },
  { prefix: '/admin/anlagen', perm: 'finanzen' },
  // Preise & Aktionen
  { prefix: '/admin/preise', perm: 'preise' },
  { prefix: '/admin/gutscheine', perm: 'preise' },
  { prefix: '/admin/rabatte', perm: 'preise' },
  { prefix: '/admin/warenkorb-erinnerung', perm: 'preise' },
  { prefix: '/admin/newsletter', perm: 'preise' },
  // Content
  { prefix: '/admin/startseite', perm: 'content' },
  { prefix: '/admin/blog', perm: 'content' },
  { prefix: '/admin/social', perm: 'content' },
  // Finanzen
  { prefix: '/admin/buchhaltung', perm: 'finanzen' },
  // Berichte
  { prefix: '/admin/analytics', perm: 'berichte' },
  { prefix: '/admin/emails', perm: 'berichte' },
  { prefix: '/admin/beta-feedback', perm: 'berichte' },
  { prefix: '/admin/aktivitaetsprotokoll', perm: 'berichte' },
  // System
  { prefix: '/admin/legal', perm: 'system' },
  { prefix: '/admin/einstellungen', perm: 'system' },
];

/**
 * Gibt die erforderliche Permission fuer einen Admin-Pfad zurueck,
 * oder null fuer frei zugaengliche Seiten (Dashboard, Login).
 */
export function requiredPermissionForPath(pathname: string): PermissionKey | null {
  if (!pathname.startsWith('/admin')) return null;
  if (pathname === '/admin' || pathname === '/admin/') return null; // Dashboard fuer alle
  if (pathname === '/admin/login') return null;
  for (const rule of PATH_PERMISSIONS) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) return rule.perm;
  }
  return null;
}

// ============================================================
// Password-Hashing (scrypt, Node built-in, kein zusaetzliches Paket)
// ============================================================

/**
 * Format: scrypt$N$<salt-hex>$<hash-hex>
 * N kodiert die scrypt-Kosten; derzeit fix 1 = Standard-Parameter.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Passwort muss mindestens 8 Zeichen haben.');
  }
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  try {
    const salt = Buffer.from(parts[2], 'hex');
    const expected = Buffer.from(parts[3], 'hex');
    const actual = await scrypt(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ============================================================
// Admin-User-Typ
// ============================================================
export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: 'owner' | 'employee';
  permissions: PermissionKey[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  created_by: string | null;
}

export interface AdminUserRow extends AdminUser {
  password_hash: string;
}

/** Legacy-Owner aus ENV-Passwort (virtueller User, wenn noch keine DB-Accounts da). */
export function legacyEnvUser(): AdminUser {
  return {
    id: 'legacy-env',
    email: 'admin@cam2rent.de',
    username: 'admin',
    name: 'Admin (ENV-Passwort)',
    role: 'owner',
    permissions: [...PERMISSION_KEYS],
    is_active: true,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    last_login_at: null,
    created_by: null,
  };
}

/**
 * Pruefung ob ein Username erlaubt ist.
 * - 3-32 Zeichen, nur a-z, 0-9, . _ - (kein @ → so unterscheiden wir von E-Mail).
 */
export function isValidUsername(input: string): boolean {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(input);
}

/** Hat der User die angegebene Permission? Owner haben automatisch alles. */
export function hasPermission(user: AdminUser | null, perm: PermissionKey): boolean {
  if (!user || !user.is_active) return false;
  if (user.role === 'owner') return true;
  return user.permissions.includes(perm);
}

function sanitizeUser(row: AdminUserRow | Record<string, unknown>): AdminUser {
  const r = row as AdminUserRow;
  return {
    id: r.id,
    email: r.email,
    username: r.username ?? null,
    name: r.name,
    role: r.role,
    permissions: Array.isArray(r.permissions) ? (r.permissions as PermissionKey[]) : [],
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
    last_login_at: r.last_login_at,
    created_by: r.created_by,
  };
}

const SELECT_COLS = 'id, email, username, name, role, permissions, is_active, created_at, updated_at, last_login_at, created_by, password_hash';

// ============================================================
// CRUD auf admin_users
// ============================================================

export async function listAdminUsers(): Promise<AdminUser[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select(SELECT_COLS)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(sanitizeUser);
}

export async function getAdminUserById(id: string): Promise<AdminUser | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_users')
    .select(SELECT_COLS)
    .eq('id', id)
    .maybeSingle();
  return data ? sanitizeUser(data) : null;
}

export async function getAdminUserByEmail(email: string): Promise<AdminUserRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_users')
    .select(SELECT_COLS)
    .ilike('email', email.trim())
    .maybeSingle();
  return (data as AdminUserRow | null) ?? null;
}

export async function getAdminUserByUsername(username: string): Promise<AdminUserRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_users')
    .select(SELECT_COLS)
    .ilike('username', username.trim())
    .maybeSingle();
  return (data as AdminUserRow | null) ?? null;
}

/**
 * Sucht einen User per E-Mail oder Username.
 * Routing: enthaelt der Eingabe-String '@', wird per E-Mail gesucht, sonst per Username.
 */
export async function getAdminUserByLoginId(input: string): Promise<AdminUserRow | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) return getAdminUserByEmail(trimmed);
  return getAdminUserByUsername(trimmed);
}

function normalizeUsername(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

export interface CreateAdminUserInput {
  email: string;
  name: string;
  password: string;
  username?: string | null;
  role?: 'owner' | 'employee';
  permissions?: PermissionKey[];
  createdBy?: string | null;
}

export async function createAdminUser(input: CreateAdminUserInput): Promise<AdminUser> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Ungültige E-Mail-Adresse.');
  if (!input.name.trim()) throw new Error('Name darf nicht leer sein.');
  const username = normalizeUsername(input.username);
  if (username && !isValidUsername(username)) {
    throw new Error('Benutzername: 3–32 Zeichen, nur Buchstaben/Zahlen/._-');
  }
  const hash = await hashPassword(input.password);
  const permissions = (input.permissions ?? []).filter((p) => PERMISSION_KEYS.includes(p));
  const role = input.role ?? 'employee';

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      email,
      username,
      name: input.name.trim(),
      password_hash: hash,
      role,
      permissions,
      is_active: true,
      created_by: input.createdBy && input.createdBy !== 'legacy-env' ? input.createdBy : null,
    })
    .select(SELECT_COLS)
    .single();
  if (error) {
    if (error.code === '23505') {
      const msg = error.message?.includes('username')
        ? 'Dieser Benutzername wird bereits verwendet.'
        : 'Diese E-Mail wird bereits verwendet.';
      throw new Error(msg);
    }
    throw error;
  }
  return sanitizeUser(data);
}

export interface UpdateAdminUserInput {
  name?: string;
  email?: string;
  username?: string | null;
  role?: 'owner' | 'employee';
  permissions?: PermissionKey[];
  is_active?: boolean;
  password?: string;
}

export async function updateAdminUser(id: string, input: UpdateAdminUserInput): Promise<AdminUser> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();
  if (input.username !== undefined) {
    const u = normalizeUsername(input.username);
    if (u && !isValidUsername(u)) {
      throw new Error('Benutzername: 3–32 Zeichen, nur Buchstaben/Zahlen/._-');
    }
    patch.username = u;
  }
  if (input.role !== undefined) patch.role = input.role;
  if (input.permissions !== undefined) patch.permissions = input.permissions.filter((p) => PERMISSION_KEYS.includes(p));
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.password !== undefined) patch.password_hash = await hashPassword(input.password);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_users')
    .update(patch)
    .eq('id', id)
    .select(SELECT_COLS)
    .single();
  if (error) {
    if (error.code === '23505') {
      const msg = error.message?.includes('username')
        ? 'Dieser Benutzername wird bereits verwendet.'
        : 'Diese E-Mail wird bereits verwendet.';
      throw new Error(msg);
    }
    throw error;
  }

  // Bei Deaktivierung oder Rollen-/Permission-Aenderung alle Sessions invalidieren
  if (input.is_active === false || input.role !== undefined || input.permissions !== undefined || input.password !== undefined) {
    await supabase.from('admin_sessions').delete().eq('user_id', id);
  }

  return sanitizeUser(data);
}

export async function deleteAdminUser(id: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('admin_users').delete().eq('id', id);
  if (error) throw error;
}

export async function countOwners(): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from('admin_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'owner')
    .eq('is_active', true);
  return count ?? 0;
}

// ============================================================
// Sessions
// ============================================================
const SESSION_TTL_DAYS = 7;
const SESSION_PREFIX = 'sess_';

export function generateSessionToken(): string {
  return SESSION_PREFIX + randomBytes(32).toString('hex');
}

export function isSessionToken(token: string | undefined | null): boolean {
  return !!token && token.startsWith(SESSION_PREFIX);
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const supabase = createServiceClient();
  const { error } = await supabase.from('admin_sessions').insert({
    token,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
    user_agent: meta.userAgent ?? null,
    ip_address: meta.ipAddress ?? null,
  });
  if (error) throw error;
  // Letzter Login stempeln
  await supabase.from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('id', userId);
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('admin_sessions').delete().eq('token', token);
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('admin_sessions').delete().eq('user_id', userId);
}

/**
 * Liefert den User zu einem Session-Token oder null wenn abgelaufen/unbekannt.
 * Stempelt `last_used_at` weich (fire-and-forget).
 */
export async function getUserBySession(token: string): Promise<AdminUser | null> {
  if (!isSessionToken(token)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_sessions')
    .select('token, user_id, expires_at, admin_users!inner(id, email, username, name, role, permissions, is_active, created_at, updated_at, last_login_at, created_by, password_hash)')
    .eq('token', token)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await deleteSession(token).catch(() => {});
    return null;
  }
  // Soft touch
  supabase.from('admin_sessions').update({ last_used_at: new Date().toISOString() }).eq('token', token).then(() => {}, () => {});
  const user = Array.isArray(data.admin_users) ? data.admin_users[0] : data.admin_users;
  if (!user || !user.is_active) return null;
  return sanitizeUser(user as AdminUserRow);
}

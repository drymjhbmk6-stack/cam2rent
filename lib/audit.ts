import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

interface AuditParams {
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  changes?: Record<string, unknown>;
  adminUserName?: string;
  adminUserId?: string | null;
  request?: Request;
}

/**
 * Zentrale Audit-Log-Funktion.
 * Schreibt in die bestehende `admin_audit_log`-Tabelle.
 *
 * Spalten in der Tabelle: admin_user_id, admin_user_name, action, entity_type,
 * entity_id, entity_label, details JSONB, created_at. IP wird in `details`
 * abgelegt, da die Tabelle keine separate ip_address-Spalte hat.
 *
 * Der eingeloggte Admin wird (wenn nicht explizit uebergeben) ueber den Cookie
 * aus dem Request-Context ermittelt — funktioniert daher nur in API-Routen.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const supabase = createServiceClient();

    let ipAddress: string | null = null;
    if (params.request) {
      ipAddress =
        params.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        params.request.headers.get('x-real-ip') ||
        null;
    }

    let adminUserId = params.adminUserId ?? null;
    let adminUserName = params.adminUserName ?? null;
    if (!adminUserId || !adminUserName) {
      try {
        const me = await getCurrentAdminUser();
        if (me) {
          if (!adminUserId) adminUserId = me.id === 'legacy-env' ? null : me.id;
          if (!adminUserName) adminUserName = me.name;
        }
      } catch {
        // Cookie-Zugriff kann in bestimmten Runtimes fehlschlagen
      }
    }

    const details: Record<string, unknown> = { ...(params.changes ?? {}) };
    if (ipAddress) details.ip_address = ipAddress;

    const { error } = await supabase.from('admin_audit_log').insert({
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      entity_label: params.entityLabel || null,
      details: Object.keys(details).length > 0 ? details : null,
      admin_user_id: adminUserId,
      admin_user_name: adminUserName ?? 'admin',
    });

    if (error) {
      console.error('Audit-Log DB-Fehler:', error.message);
    }
  } catch (err) {
    // Audit-Logging darf niemals den Hauptprozess blockieren
    console.error('Audit-Log Fehler:', err);
  }
}

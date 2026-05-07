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
    // Sweep 9 M3: User-Agent zusaetzlich loggen — bei Cookie-Diebstahl
    // wertvolle Forensik-Information.
    if (params.request) {
      const ua = params.request.headers.get('user-agent');
      if (ua) details.user_agent = ua.slice(0, 500);
    }

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
      // Sweep 9 M3: Fallback-Notification — bei Audit-Log-Outage merkt der
      // Owner das sonst nicht, kritisches Compliance-Risiko bei DSGVO/GoBD.
      // Critical-Aktionen (delete/anonymize/env_mode) loggen wir doppelt
      // ueber admin_notifications, damit der Vorfall aufgespuert werden kann.
      const isCritical =
        params.action.includes('delete') ||
        params.action.includes('anonymize') ||
        params.action.startsWith('env_mode.') ||
        params.action.startsWith('period.') ||
        params.action.includes('blacklist');
      if (isCritical) {
        try {
          await supabase.from('admin_notifications').insert({
            type: 'payment_failed',
            title: 'Audit-Log Schreibfehler (kritische Aktion)',
            message: `${params.action} auf ${params.entityType}/${params.entityId ?? '?'} konnte nicht protokolliert werden: ${error.message}`,
            link: null,
            is_read: false,
          });
        } catch (notifErr) {
          console.error('Audit-Notification-Fehler:', notifErr);
        }
      }
    }
  } catch (err) {
    // Audit-Logging darf niemals den Hauptprozess blockieren
    console.error('Audit-Log Fehler:', err);
  }
}

import { createServiceClient } from '@/lib/supabase';

interface AuditParams {
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  changes?: Record<string, unknown>;
  adminUserName?: string;
  request?: Request;
}

/**
 * Zentrale Audit-Log-Funktion.
 * Schreibt in die bestehende `admin_audit_log`-Tabelle.
 *
 * Action-Naming: {entityType}.{verb}
 * z.B. 'invoice.send', 'credit_note.approve', 'dunning.create_draft'
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

    await supabase.from('admin_audit_log').insert({
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      entity_label: params.entityLabel || null,
      changes: params.changes || null,
      admin_user_name: params.adminUserName || 'admin',
      ip_address: ipAddress,
    });
  } catch (err) {
    // Audit-Logging darf niemals den Hauptprozess blockieren
    console.error('Audit-Log Fehler:', err);
  }
}

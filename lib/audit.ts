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

    // Schema: `details` (JSONB), NICHT `changes`. IP wird in details abgelegt,
    // da die Tabelle keine separate ip_address-Spalte hat.
    const detailsPayload: Record<string, unknown> = { ...(params.changes || {}) };
    if (ipAddress) detailsPayload.ip_address = ipAddress;

    const { error } = await supabase.from('admin_audit_log').insert({
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      entity_label: params.entityLabel || null,
      details: Object.keys(detailsPayload).length > 0 ? detailsPayload : null,
      admin_user_name: params.adminUserName || 'admin',
    });

    if (error) {
      console.error('Audit-Log DB-Fehler:', error.message);
    }
  } catch (err) {
    // Audit-Logging darf niemals den Hauptprozess blockieren
    console.error('Audit-Log Fehler:', err);
  }
}

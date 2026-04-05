import { SupabaseClient } from '@supabase/supabase-js';

interface AuditEvent {
  adminUserId?: string;
  adminUserName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  details?: Record<string, unknown>;
}

/**
 * Logs an audit event to admin_audit_log.
 * Fire-and-forget: catches errors silently so it never blocks the caller.
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  event: AuditEvent
): Promise<void> {
  try {
    await supabase.from('admin_audit_log').insert({
      admin_user_id: event.adminUserId ?? null,
      admin_user_name: event.adminUserName ?? null,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      entity_label: event.entityLabel ?? null,
      details: event.details ?? null,
    });
  } catch {
    // Silent — audit logging must never break the main flow
  }
}

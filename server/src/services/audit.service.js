import prisma from '../utils/prisma.js';

export async function logAudit({ userId, action, entity, entityId, oldValue, newValue, ipAddress }) {
  try {
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action,
        entity,
        entity_id: entityId,
        old_value: oldValue ?? undefined,
        new_value: newValue ?? undefined,
        ip_address: ipAddress,
      },
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
}

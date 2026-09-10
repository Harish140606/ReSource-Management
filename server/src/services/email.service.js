import dayjs from 'dayjs';
import prisma from '../utils/prisma.js';

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const BREVO_API_KEY   = process.env.BREVO_API_KEY;
const BREVO_SENDER    = process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function send({ to, subject, html }) {
  if (!to.length) {
    console.warn(`[Email] No recipients for "${subject}" — skipping`);
    return;
  }
  if (!BREVO_API_KEY) {
    console.warn('[Email] BREVO_API_KEY not set — notifications disabled.');
    return;
  }
  if (!BREVO_SENDER) {
    console.warn('[Email] BREVO_SENDER_EMAIL not set — notifications disabled.');
    return;
  }

  console.log(`[Email] Sending "${subject}" → ${to.join(', ')}`);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'ReSource Management', email: BREVO_SENDER },
      to: to.map(email => ({ email })),
      subject,
      htmlContent: html,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[Email] Brevo error:', JSON.stringify(data));
  } else {
    console.log(`[Email] Delivered messageId=${data.messageId}`);
  }
}

function emailsForRoles(employees) {
  return employees.map(e => e.email).filter(Boolean);
}

// ── HTML template ─────────────────────────────────────────────────────────────

function buildHtml({ headline, intro, declNo, source, date, totalKg, actionLabel, actionUrl, footer }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#00838F;padding:24px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">ReSource Management</p>
          <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">Automated notification</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#10262A;">${headline}</h2>
          <p style="margin:0 0 24px;font-size:14px;color:#555;">${intro}</p>
          <!-- Declaration details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:8px;padding:16px;margin-bottom:24px;">
            <tr><td style="padding:4px 0;font-size:13px;color:#888;width:140px;">Declaration No.</td>
                <td style="padding:4px 0;font-size:13px;font-weight:700;color:#10262A;">${declNo}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#888;">Source</td>
                <td style="padding:4px 0;font-size:13px;color:#10262A;">${source}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#888;">Date</td>
                <td style="padding:4px 0;font-size:13px;color:#10262A;">${date}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#888;">Total Weight</td>
                <td style="padding:4px 0;font-size:13px;font-weight:700;color:#00838F;">${totalKg} kg</td></tr>
          </table>
          ${actionUrl ? `
          <a href="${actionUrl}" style="display:inline-block;background:#00838F;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;margin-bottom:24px;">${actionLabel || 'View Declaration'}</a>
          ` : ''}
          <p style="margin:16px 0 0;font-size:12px;color:#aaa;">${footer || 'This is an automated message — please do not reply.'}</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f0f4ff;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#aaa;">ReSource Management &nbsp;·&nbsp; Confidential</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Notification triggers ─────────────────────────────────────────────────────

function totalKg(decl) {
  return (decl.line_items || [])
    .reduce((s, li) => s + Number(li.weight_kg ?? 0), 0)
    .toFixed(2);
}

function fmtDate(d) {
  return dayjs(d).format('DD-MM-YYYY');
}

const declUrl = (id) => `${FRONTEND_URL}/declaration/${id}`;

/**
 * Called after submitDeclaration — notify all active DEPT_HEADs that a new
 * declaration is waiting for their approval.
 */
export async function notifySubmitted(decl) {
  const approvers = await prisma.employee.findMany({
    where: { role: 'DEPT_HEAD', is_active: true },
    select: { email: true },
  });
  await send({
    to: emailsForRoles(approvers),
    subject: `[Action Required] Declaration ${decl.declaration_no} awaits Dept Approval`,
    html: buildHtml({
      headline: 'Declaration Awaiting Your Approval',
      intro: `A new scrap declaration has been submitted and requires your <strong>departmental approval</strong>.`,
      declNo: decl.declaration_no,
      source: decl.source,
      date: fmtDate(decl.date),
      totalKg: totalKg(decl),
      actionLabel: 'Review & Approve',
      actionUrl: declUrl(decl.id),
    }),
  });
}

/**
 * Called when SUBMITTED → DEPT_APPROVED — notify all active IREP officers.
 */
export async function notifyDeptApproved(decl) {
  const approvers = await prisma.employee.findMany({
    where: { role: 'IREP', is_active: true },
    select: { email: true },
  });
  await send({
    to: emailsForRoles(approvers),
    subject: `[Action Required] Declaration ${decl.declaration_no} awaits IREP Authorization`,
    html: buildHtml({
      headline: 'IREP Authorization Required',
      intro: `Declaration <strong>${decl.declaration_no}</strong> has been approved by the Department Head and now requires your <strong>IREP authorization</strong>.`,
      declNo: decl.declaration_no,
      source: decl.source,
      date: fmtDate(decl.date),
      totalKg: totalKg(decl),
      actionLabel: 'Authorize Now',
      actionUrl: declUrl(decl.id),
    }),
  });
}

/**
 * Called when DEPT_APPROVED → IREP_AUTHORIZED — notify all active SECURITY officers.
 */
export async function notifyIrepAuthorized(decl) {
  const approvers = await prisma.employee.findMany({
    where: { role: 'SECURITY', is_active: true },
    select: { email: true },
  });
  await send({
    to: emailsForRoles(approvers),
    subject: `[Action Required] Declaration ${decl.declaration_no} awaits Security Authorization`,
    html: buildHtml({
      headline: 'Security Authorization Required',
      intro: `Declaration <strong>${decl.declaration_no}</strong> has been IREP-authorized and is now pending your <strong>security authorization</strong>.`,
      declNo: decl.declaration_no,
      source: decl.source,
      date: fmtDate(decl.date),
      totalKg: totalKg(decl),
      actionLabel: 'Authorize & Complete',
      actionUrl: declUrl(decl.id),
    }),
  });
}

/**
 * Called when IREP_AUTHORIZED → COMPLETED — notify the original declarer.
 */
export async function notifyCompleted(decl) {
  const declarer = await prisma.employee.findUnique({
    where: { id: decl.employee_id },
    select: { email: true, name: true },
  });
  if (!declarer?.email) return;
  await send({
    to: [declarer.email],
    subject: `Declaration ${decl.declaration_no} Completed`,
    html: buildHtml({
      headline: 'Your Declaration is Fully Approved',
      intro: `Hi ${declarer.name}, your scrap declaration <strong>${decl.declaration_no}</strong> has been fully authorized by Security and is now <strong>completed</strong>. The quantities have been added to the waste ledger.`,
      declNo: decl.declaration_no,
      source: decl.source,
      date: fmtDate(decl.date),
      totalKg: totalKg(decl),
      actionLabel: 'View Declaration',
      actionUrl: declUrl(decl.id),
    }),
  });
}

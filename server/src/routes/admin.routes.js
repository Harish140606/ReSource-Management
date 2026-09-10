import { Router } from 'express';
import dayjs from 'dayjs';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { ok } from '../utils/response.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/audit-logs', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const { action, user_id, search, date_from, date_to } = req.query;

    const where = {};

    if (action)    where.action  = action;
    if (user_id)   where.user_id = user_id;
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at.gte = dayjs(date_from).startOf('day').toDate();
      if (date_to)   where.created_at.lte = dayjs(date_to).endOf('day').toDate();
    }

    // Full-name / emp_no search via relation filter
    if (search) {
      where.user = {
        OR: [
          { name:   { contains: search, mode: 'insensitive' } },
          { emp_no: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, emp_no: true, role: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    ok(res, { logs, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// Distinct action types present in the log (for filter dropdown)
router.get('/audit-logs/actions', async (req, res, next) => {
  try {
    const rows = await prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    ok(res, rows.map(r => r.action));
  } catch (err) { next(err); }
});

// All employees (minimal) for the user filter dropdown
router.get('/employees-list', async (req, res, next) => {
  try {
    const employees = await prisma.employee.findMany({
      select: { id: true, name: true, emp_no: true, role: true },
      orderBy: { name: 'asc' },
    });
    ok(res, employees);
  } catch (err) { next(err); }
});

// Show which emails would be notified at each approval stage.
router.get('/notification-preview', async (req, res, next) => {
  try {
    const roles = ['DEPT_HEAD', 'IREP', 'SECURITY'];
    const result = {};
    for (const role of roles) {
      const employees = await prisma.employee.findMany({
        where: { role, is_active: true },
        select: { emp_no: true, name: true, email: true, is_active: true },
      });
      result[role] = employees;
    }
    ok(res, result);
  } catch (err) { next(err); }
});

// Test email — sends a real email via Brevo HTTP API to verify configuration.
router.post('/test-email', async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(422).json({ error: { message: 'to is required' } });

    const apiKey = process.env.BREVO_API_KEY;
    const sender = process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER;

    if (!apiKey) return res.status(500).json({ error: { message: 'BREVO_API_KEY is not set in the environment variables.' } });
    if (!sender) return res.status(500).json({ error: { message: 'BREVO_SENDER_EMAIL is not set in the environment variables.' } });

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'ReSource Management', email: sender },
        to: [{ email: to }],
        subject: 'ReSource Management — Email Test',
        htmlContent: `<p>This is a test email from your ReSource Management system.</p>
                      <p><strong>Sender:</strong> ${sender} ✓</p>
                      <p>If you received this, email notifications are working correctly!</p>`,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: { message: data.message || 'Brevo returned an error', detail: data } });
    }

    ok(res, { sent: true, to, from: sender, messageId: data.messageId });
  } catch (err) { next(err); }
});

export default router;

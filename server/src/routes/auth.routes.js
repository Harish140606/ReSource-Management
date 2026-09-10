import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { loginSchema, refreshSchema } from '../schemas/auth.schema.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from '../services/audit.service.js';

const router = Router();

function signAccess(id) {
  return jwt.sign({ sub: id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
}

function signRefresh(id) {
  return jwt.sign({ sub: id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
}

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { emp_no, password } = req.body;
    const employee = await prisma.employee.findUnique({ where: { emp_no } });
    if (!employee || !employee.is_active) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, employee.password_hash);
    if (!valid) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

    const access_token = signAccess(employee.id);
    const refresh_token = signRefresh(employee.id);

    await logAudit({
      userId: employee.id,
      action: 'LOGIN',
      entity: 'employees',
      entityId: employee.id,
      ipAddress: req.ip,
    });

    const { password_hash, ...user } = employee;
    ok(res, { access_token, refresh_token, user });
  } catch (err) { next(err); }
});

router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    const employee = await prisma.employee.findUnique({ where: { id: payload.sub } });
    if (!employee || !employee.is_active) throw new AppError('User inactive', 401, 'UNAUTHORIZED');

    const access_token = signAccess(employee.id);
    ok(res, { access_token });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired refresh token', 401, 'TOKEN_INVALID'));
    }
    next(err);
  }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await logAudit({
      userId: req.user.id,
      action: 'LOGOUT',
      entity: 'employees',
      entityId: req.user.id,
      ipAddress: req.ip,
    });
    ok(res, { message: 'Logged out' });
  } catch (err) { next(err); }
});

export default router;

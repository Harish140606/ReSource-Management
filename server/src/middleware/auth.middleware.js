import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import prisma from '../utils/prisma.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401, 'UNAUTHORIZED');
    }
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const employee = await prisma.employee.findUnique({ where: { id: payload.sub } });
    if (!employee || !employee.is_active) {
      throw new AppError('User not found or inactive', 401, 'UNAUTHORIZED');
    }
    req.user = employee;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401, 'TOKEN_INVALID'));
    }
    next(err);
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('Authentication required for live endpoints', 401, 'UNAUTHORIZED'));
  }
  authenticate(req, res, next);
}

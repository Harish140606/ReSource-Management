import { AppError } from '../utils/AppError.js';

const ROLE_RANK = {
  EMPLOYEE: 1,
  DEPT_HEAD: 2,
  IREP: 3,
  SECURITY: 4,
  FACILITY_MANAGER: 5,
  ADMIN: 6,
};

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
  };
}

export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    if ((ROLE_RANK[req.user.role] ?? 0) < (ROLE_RANK[minRole] ?? 99)) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
  };
}

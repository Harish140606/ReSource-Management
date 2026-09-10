export const ROLES = {
  EMPLOYEE: 'EMPLOYEE',
  DEPT_HEAD: 'DEPT_HEAD',
  IREP: 'IREP',
  SECURITY: 'SECURITY',
  FACILITY_MANAGER: 'FACILITY_MANAGER',
  ADMIN: 'ADMIN',
};

export const ROLE_LABELS = {
  EMPLOYEE: 'Employee',
  DEPT_HEAD: 'Dept Head',
  IREP: 'IREP Officer',
  SECURITY: 'Security Officer',
  FACILITY_MANAGER: 'Facility Manager',
  ADMIN: 'Admin',
};

export const ROLE_RANK = {
  EMPLOYEE: 1,
  DEPT_HEAD: 2,
  IREP: 3,
  SECURITY: 4,
  FACILITY_MANAGER: 5,
  ADMIN: 6,
};

export function hasMinRole(userRole, minRole) {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 99);
}

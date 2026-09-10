import { z } from 'zod';
import { PRODUCTION_FUNCTIONS } from '../constants/productionFunctions.js';

export const createEmployeeSchema = z.object({
  emp_no: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['EMPLOYEE', 'DEPT_HEAD', 'IREP', 'SECURITY', 'FACILITY_MANAGER', 'ADMIN']),
  production_function: z.enum(PRODUCTION_FUNCTIONS).optional(),
  zone: z.string().optional(),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['EMPLOYEE', 'DEPT_HEAD', 'IREP', 'SECURITY', 'FACILITY_MANAGER', 'ADMIN']).optional(),
  production_function: z.enum(PRODUCTION_FUNCTIONS).optional().nullable(),
  zone: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

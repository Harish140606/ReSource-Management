import { z } from 'zod';

export const loginSchema = z.object({
  emp_no: z.string().min(1),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

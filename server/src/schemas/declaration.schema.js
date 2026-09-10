import { z } from 'zod';

const lineItemSchema = z.object({
  waste_type: z.enum(['GENERAL', 'HAZARDOUS', 'EWASTE']),
  category: z.string().min(1),
  pallet_qty: z.number().nonnegative().nullable().optional(),
  weight_kg: z.number().nonnegative().nullable().optional(),
  remarks: z.string().nullable().optional(),
  bat_id: z.string().nullable().optional(),
});

export const createDeclarationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.string().min(1),
  time: z.string().min(1),
  zone: z.string().min(1),
  production_function: z.string().min(1),
  source: z.enum(['BAT', 'SOFT']).optional(),
  reference_no: z.string().optional(),
  disposal_route: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1),
}).superRefine((data, ctx) => {
  if (data.source !== 'BAT') return;
  data.line_items.forEach((li, i) => {
    const hasWeight = li.weight_kg != null && Number(li.weight_kg) > 0;
    if (hasWeight && !li.bat_id?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['line_items', i, 'bat_id'],
        message: 'BAT ID is required for every line with a weight entered',
      });
    }
  });
});

export const updateDisposalSchema = z.object({
  disposal: z.number().nonnegative(),
});

export const updateStorageLocationSchema = z.object({
  items: z.array(z.object({
    line_item_id: z.string().uuid(),
    storage_location: z.string().nullable(),
  })).min(1),
});

export const editLineItemSchema = z.object({
  category: z.string().min(1).optional(),
  waste_type: z.enum(['GENERAL', 'HAZARDOUS', 'EWASTE']).optional(),
  weight_kg: z.number().nonnegative().nullable().optional(),
  pallet_qty: z.number().nonnegative().nullable().optional(),
  remarks: z.string().nullable().optional(),
  bat_id: z.string().nullable().optional(),
});

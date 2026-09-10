import { z } from 'zod';

const itemSchema = z.object({
  material_description: z.string().min(1),
  category: z.string().min(1),
  waste_type: z.enum(['GENERAL', 'HAZARDOUS', 'EWASTE']).optional(),
  qty_kg: z.number().positive(),
  unit_price: z.number().nonnegative().nullable().optional(),
});

export const createDisposalInvoiceSchema = z.object({
  // Optional for manual disposals — the service generates a reference when absent.
  invoice_no: z.string().min(1).optional(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendor_name: z.string().min(1).optional(),
  vendor_gstin: z.string().nullable().optional(),
  total_net_amount: z.number().nullable().optional(),
  total_tax: z.number().nullable().optional(),
  total_amount: z.number().nullable().optional(),
  source_file: z.string().nullable().optional(),
  vehicle_no: z.string().nullable().optional(),
  weighment_serial_no: z.string().nullable().optional(),
  gross_weight_kg: z.number().nonnegative().nullable().optional(),
  tare_weight_kg: z.number().nonnegative().nullable().optional(),
  net_weight_kg: z.number().nonnegative().nullable().optional(),

  // Empty (tare) weighbridge ticket — vehicle weighed alone.
  empty_serial_no: z.string().nullable().optional(),
  empty_vehicle_no: z.string().nullable().optional(),
  empty_weighed_date: z.string().nullable().optional(),
  empty_weighed_time: z.string().nullable().optional(),
  empty_weight_kg: z.number().nonnegative().nullable().optional(),

  // Loaded (gross) weighbridge ticket — vehicle weighed with scrap on board.
  loaded_serial_no: z.string().nullable().optional(),
  loaded_vehicle_no: z.string().nullable().optional(),
  loaded_weighed_date: z.string().nullable().optional(),
  loaded_weighed_time: z.string().nullable().optional(),
  loaded_material: z.string().nullable().optional(),
  loaded_gross_weight_kg: z.number().nonnegative().nullable().optional(),
  loaded_tare_weight_kg: z.number().nonnegative().nullable().optional(),
  loaded_net_weight_kg: z.number().nonnegative().nullable().optional(),

  items: z.array(itemSchema).min(1),
});

export const editDisposalItemSchema = z.object({
  material_description: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  qty_kg: z.number().positive().optional(),
  unit_price: z.number().nonnegative().nullable().optional(),
});

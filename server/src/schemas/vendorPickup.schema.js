import { z } from 'zod';

export const createVendorPickupSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendor_name: z.string().min(1),
  vehicle_entry_no: z.string().min(1),
  vehicle_out_no: z.string().optional(),
  vehicle_holding_time: z.string().optional(),
  invoice_raise_time: z.string().optional().nullable(),
  invoice_received_time: z.string().optional().nullable(),
  category: z.string().min(1),
  remarks: z.string().optional(),
});

import { z } from 'zod';

export const createWeighmentRecordSchema = z.object({
  empty_serial_no: z.string().nullable().optional(),
  empty_vehicle_no: z.string().nullable().optional(),
  empty_weighed_date: z.string().nullable().optional(),
  empty_weighed_time: z.string().nullable().optional(),
  empty_weight_kg: z.number().nonnegative().nullable().optional(),

  loaded_serial_no: z.string().nullable().optional(),
  loaded_vehicle_no: z.string().nullable().optional(),
  loaded_weighed_date: z.string().nullable().optional(),
  loaded_weighed_time: z.string().nullable().optional(),
  loaded_material: z.string().nullable().optional(),
  loaded_gross_weight_kg: z.number().nonnegative().nullable().optional(),
  loaded_tare_weight_kg: z.number().nonnegative().nullable().optional(),
  loaded_net_weight_kg: z.number().nonnegative().nullable().optional(),
});

export const editWeighmentRecordSchema = z.object({
  empty_serial_no: z.string().nullable().optional(),
  empty_vehicle_no: z.string().nullable().optional(),
  empty_weighed_date: z.string().nullable().optional(),
  empty_weighed_time: z.string().nullable().optional(),
  empty_weight_kg: z.number().nonnegative().nullable().optional(),

  loaded_serial_no: z.string().nullable().optional(),
  loaded_vehicle_no: z.string().nullable().optional(),
  loaded_weighed_date: z.string().nullable().optional(),
  loaded_weighed_time: z.string().nullable().optional(),
  loaded_material: z.string().nullable().optional(),
  loaded_gross_weight_kg: z.number().nonnegative().nullable().optional(),
  loaded_tare_weight_kg: z.number().nonnegative().nullable().optional(),
  loaded_net_weight_kg: z.number().nonnegative().nullable().optional(),
});

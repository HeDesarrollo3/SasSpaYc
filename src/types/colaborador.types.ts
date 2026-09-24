// src/types/colaborador.types.ts
import { z } from 'zod';

/** Entidad del backend (snake_case, tal como llega). */
export type BackendColaborador = {
  id: number;
  nombre: string;
  telefono: string | null;
  porcentaje_comision: number | null;
  area: string | null;
  fecha_ingreso: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

/** Entidad para el frontend (camelCase). */
export type Colaborador = {
  id: number;
  nombre: string;
  telefono: string | null;
  porcentajeComision: number | null;
  area: string | null;
  fechaIngreso: string | null;
  notas: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Zod schemas (formularios)
// ---------------------------------------------------------------------------
export const crearColaboradorSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  telefono: z
    .string()
    .trim()
    .max(30, 'Máximo 30 caracteres')
    .optional()
    .or(z.literal('')),
  porcentajeComision: z.coerce
    .number({ invalid_type_error: 'Debe ser un número' })
    .min(0, 'Mínimo 0')
    .max(100, 'Máximo 100'),
  area: z.string().trim().max(80).optional().or(z.literal('')),
  fechaIngreso: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => !v || !Number.isNaN(Date.parse(v)),
      'Fecha inválida',
    ),
  notas: z.string().trim().max(500).optional().or(z.literal('')),
  activo: z.boolean().optional(),
});

export const actualizarColaboradorSchema = crearColaboradorSchema.partial();

export type CrearColaboradorInput = z.infer<typeof crearColaboradorSchema>;
export type ActualizarColaboradorInput = z.infer<typeof actualizarColaboradorSchema>;
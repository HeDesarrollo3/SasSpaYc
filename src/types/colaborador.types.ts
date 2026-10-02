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
  /** Migración 023 */
  prueba_hasta?: string | null;
  sueldo_prueba_mensual?: number | null;
  porcentaje_referido?: number | null;
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
  /** Último día del período de prueba (sueldo fijo, sin comisión). */
  pruebaHasta: string | null;
  sueldoPruebaMensual: number | null;
  /** % para clientes que trae el colaborador (solo cabello). */
  porcentajeReferido: number | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Zod schemas (formularios)
//
// ⚠️ Decisión de tipificación: se usa `z.number()` (NO `z.coerce.number()`) y la
// conversión la hace react-hook-form con `{ valueAsNumber: true }`.
//
// Motivo: en Zod 4 `z.coerce.number()` declara su **input** como `unknown`, así
// que `z.input<typeof schema>` no cuadra con `z.output<typeof schema>` y el
// `Resolver` que devuelve `zodResolver` deja de ser asignable al `useForm`.
// Además `coerce` convierte `''` en `0`: limpiar el campo de comisión guardaba
// silenciosamente un 0%. Con `z.number()` un campo vacío produce `NaN` → error de
// validación visible, en vez de un dato incorrecto.
// ---------------------------------------------------------------------------
export const crearColaboradorSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120, 'Máximo 120 caracteres'),
  telefono: z.string().trim().max(30, 'Máximo 30 caracteres').optional().or(z.literal('')),
  porcentajeComision: z
    .number({ error: 'La comisión debe ser un número' })
    .min(0, 'Mínimo 0')
    .max(100, 'Máximo 100'),
  area: z.string().trim().max(80, 'Máximo 80 caracteres').optional().or(z.literal('')),
  fechaIngreso: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Fecha inválida'),
  notas: z.string().trim().max(500, 'Máximo 500 caracteres').optional().or(z.literal('')),
  /** Alta/edición: `true` por defecto. El backend lo envía como `activo` (snake_case). */
  activo: z.boolean().optional(),
  // ── Migración 023 ──
  enPrueba: z.boolean().optional(),
  pruebaHasta: z.string().optional().or(z.literal('')),
  sueldoPrueba: z.string().optional().or(z.literal('')),
  porcentajeReferido: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => !v || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100),
      'Entre 0 y 100',
    ),
});

/** Reparto habitual con cliente referido: 60 % colaborador / 40 % spa. */
export const PORCENTAJE_REFERIDO_DEFECTO = 60;

/** El régimen de referido es sólo para el personal de cabello. */
export function esAreaCabello(area: string | null | undefined): boolean {
  return (area ?? '').toLowerCase().includes('cabello');
}

/** Fin de la prueba por defecto: un mes después del ingreso, menos un día. */
export function finPruebaPorDefecto(fechaIngreso: string | null | undefined): string {
  const base = fechaIngreso ? new Date(`${fechaIngreso}T12:00:00Z`) : new Date();
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const actualizarColaboradorSchema = crearColaboradorSchema.partial();

export type CrearColaboradorInput = z.infer<typeof crearColaboradorSchema>;
export type ActualizarColaboradorInput = z.infer<typeof actualizarColaboradorSchema>;
/** Tipo del formulario (lo que `useForm` maneja en los inputs). */
export type ColaboradorFormInput = z.input<typeof crearColaboradorSchema>;
/** Tipo ya validado/transformado (lo que recibe `onSubmit`). */
export type ColaboradorFormOutput = z.output<typeof crearColaboradorSchema>;

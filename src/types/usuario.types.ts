// src/types/usuario.types.ts
import { z } from 'zod';
import type { Rol } from '../lib/estados';

/**
 * Roles reales de `public.usuarios.rol`.
 *
 * El mapa `ROL` de `lib/estados.ts` es la única fuente de verdad (etiqueta, tono
 * e ícono). El backend acepta los **cuatro** roles — ver
 * `backend/src/common/types/auth-user.type.ts` → `ROLES_VALIDOS` —, así que el
 * `satisfies readonly Rol[]` garantiza en compilación que esta lista no se
 * invente ningún valor que el mapa no conozca (ni que se quede corta).
 */
export const ROLES_VALIDOS = [
  'administrador',
  'recepcionista',
  'cajero',
  'colaborador',
] as const satisfies readonly Rol[];

/**
 * Entidad del backend (snake_case, tal como llega).
 *
 * `GET /usuarios` hace `SELECT *` sobre `public.usuarios`; sus columnas son
 * exactamente `id, nombre, email, rol, activo, created_at, updated_at,
 * auth_user_id` (verificado — ver `docs/03-ESQUEMA-VERIFICADO.md` §1.1).
 */
export type BackendUsuario = {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Vínculo con `public.colaboradores`. **Puede faltar**: la columna la añade la
   * migración `001_usuarios_colaborador_id.sql`, que todavía no está aplicada
   * (§1.1 avisa de que `usuarios` no la tiene). `undefined` = columna ausente.
   */
  colaborador_id?: number | null;
};

/** Entidad para el frontend (camelCase). */
export type Usuario = {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  authUserId: string | null;
  /** `null` mientras no se aplique la migración 001 (ver `BackendUsuario`). */
  colaboradorId: number | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Zod schemas (formularios)
//
// ⚠️ Decisión de tipificación (la misma que en `colaborador.types.ts`):
// `activo` lleva `.default(true)` para que `z.input` (`activo?: boolean`) y
// `z.output` (`activo: boolean`) sean tipos **distintos y explícitos**; el
// formulario se declara con los tres genéricos de `useForm` (`input`, contexto,
// `output`) y así el `Resolver` de `zodResolver` encaja sin `as`.
//
// No se usa `z.coerce.*`: en Zod 4 declara el input como `unknown` (rompe el
// `Resolver`) y convierte `''` en `0` silenciosamente.
// ---------------------------------------------------------------------------
export const crearUsuarioSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(120, 'Máximo 120 caracteres'),
  email: z.string().trim().email('Correo inválido'),
  rol: z.enum(ROLES_VALIDOS),
  /** Alta/edición: `true` por defecto (el backend lo recibe como `activo`). */
  activo: z.boolean().default(true),
  /** Lo rellena el flujo de invitación con el `id` de Supabase Auth. */
  auth_user_id: z.string().uuid().nullable().optional(),
  /** Ficha de colaborador a la que se vincula (obligatoria con rol colaborador). */
  colaborador_id: z.number().int().positive().nullable().optional(),
});

/** Edición: sin `email` ni `auth_user_id` (contrato `ActualizarUsuarioDto`). */
export const actualizarUsuarioSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(120, 'Máximo 120 caracteres')
    .optional(),
  rol: z.enum(ROLES_VALIDOS).optional(),
  activo: z.boolean().optional(),
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;
/** Tipo del formulario (lo que `useForm` maneja en los inputs). */
export type UsuarioFormInput = z.input<typeof crearUsuarioSchema>;
/** Tipo ya validado/transformado (lo que recibe `onSubmit`). */
export type UsuarioFormOutput = z.output<typeof crearUsuarioSchema>;

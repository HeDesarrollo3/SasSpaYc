import { z } from 'zod';
import type { Rol } from './auth.types';

export const ROLES_VALIDOS: Rol[] = ['administrador', 'cajero', 'recepcionista'];

/** Entidad del backend (snake_case). */
export type BackendUsuario = {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
//   auth_user_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Entidad para el frontend (camelCase). */
export type Usuario = {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  authUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
export const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  email: z.string().trim().email('Correo inválido'),
  rol: z.enum(['administrador', 'cajero', 'recepcionista']),
  activo: z.boolean().optional().default(true),
  auth_user_id: z.string().uuid().nullable().optional(),
});

// En edición: no email, no auth_user_id
export const actualizarUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120).optional(),
  rol: z.enum(['administrador', 'cajero', 'recepcionista']).optional(),
  activo: z.boolean().optional(),
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;
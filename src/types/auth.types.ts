// src/types/auth.types.ts
export type Rol = 'administrador' | 'cajero' | 'recepcionista';

export const ROLES_VALIDOS: Rol[] = ['administrador', 'cajero', 'recepcionista'];

/**
 * Perfil de negocio del usuario autenticado.
 * Espeja el `AuthUser` que devuelve `GET /api/v1/auth/me`.
 */
export type AuthUser = {
  id: number;
  auth_user_id: string;
  nombre: string;
  email: string;
  rol: Rol;
};
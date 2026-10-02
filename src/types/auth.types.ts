// src/types/auth.types.ts
//
// Fuente única de verdad de los roles: el mapa `ROL` de `src/lib/estados.ts`,
// que a su vez refleja los valores reales de `public.usuarios.rol` en Supabase
// (verificado: `administrador`, `cajero`).
//
// ⚠️ Histórico: este archivo declaraba **3 roles** y su propio `ROLES_VALIDOS`,
// mientras el backend y `lib/estados.ts` tenían 4. Tener dos listas distintas es
// exactamente lo que produjo el bug de los 16 `@Roles()` inalcanzables en el
// backend. Aquí se deriva para que no puedan volver a divergir.

import { ROL, type Rol } from '../lib/estados';

export type { Rol };

/** Los 4 roles válidos del sistema, derivados del mapa de estados. */
export const ROLES_VALIDOS = Object.keys(ROL) as Rol[];

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
  /**
   * Vínculo con `public.colaboradores` (`usuarios.colaborador_id`).
   *
   * El backend ya lo devuelve, pero **la columna llega con la migración 001**:
   * hasta que se aplique siempre será `null`. Es lo que permite al portal del
   * colaborador saber quién registra el servicio.
   */
  colaborador_id?: number | null;
};

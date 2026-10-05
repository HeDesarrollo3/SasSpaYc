// src/services/usuarios.service.ts
import { api, type ApiSuccess, type Paginated } from './api';
import type {
  BackendUsuario,
  Usuario,
  CrearUsuarioInput,
  ActualizarUsuarioInput,
} from '../types/usuario.types';

/**
 * El listado se declara **ya mapeado a camelCase**: `Paginated<Usuario>`.
 *
 * Antes el alias era `ApiSuccess<BackendUsuario[]>`, así que TypeScript creía que
 * el hook devolvía filas crudas aunque el mapper sí se ejecutaba (mismo desajuste
 * que tenía `colaboradores.service.ts`). Peor: como el tipo declarado de `data`
 * seguía siendo `BackendUsuario[]`, el `map(toUsuario)` no compilaba (TS2322).
 */
type PaginatedUsuarios = Paginated<Usuario>;

export type ListarUsuariosFiltros = {
  page?: number;
  limit?: number;
  sort?: string;
};

// ---------------------------------------------------------------------------
// Mappers snake_case ↔ camelCase
// ---------------------------------------------------------------------------
function toUsuario(b: BackendUsuario): Usuario {
  return {
    id: b.id,
    nombre: b.nombre,
    email: b.email,
    rol: b.rol,
    activo: b.activo,
    authUserId: b.auth_user_id,
    // La columna llega sólo si la migración `001_usuarios_colaborador_id.sql`
    // está aplicada: `undefined` (columna ausente) se normaliza a `null`.
    colaboradorId: b.colaborador_id ?? null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

/** Payload de alta: SIEMPRE snake_case (contrato `CrearUsuarioDto`). */
function toBackendCreatePayload(input: CrearUsuarioInput) {
  return {
    nombre: input.nombre,
    email: input.email,
    rol: input.rol,
    activo: input.activo ?? true,
    auth_user_id: input.auth_user_id ?? null,
  };
}

/** Payload de edición: SIEMPRE snake_case (contrato `ActualizarUsuarioDto`). */
function toBackendUpdatePayload(input: ActualizarUsuarioInput) {
  return {
    nombre: input.nombre ?? null,
    rol: input.rol ?? null,
    activo: input.activo ?? null,
  };
}

// ---------------------------------------------------------------------------
// Service
//
// Los métodos de escritura se tipan con `ApiSuccess<T>`, no con
// `ApiResponse<T>`: el interceptor de `api.ts` desempaqueta el envelope y
// **rechaza** la promesa en caso de error, así que lo que resuelve la promesa es
// siempre el cuerpo de éxito. Con la unión `ApiResponse<T>` habría que comprobar
// `res.success` (código muerto) y `res.data` ni siquiera es accesible.
// ---------------------------------------------------------------------------
export const UsuariosService = {
  listar: async (filtros: ListarUsuariosFiltros = {}): Promise<PaginatedUsuarios> => {
    const params = new URLSearchParams();
    if (filtros.page) params.set('page', String(filtros.page));
    if (filtros.limit) params.set('limit', String(filtros.limit));
    if (filtros.sort) params.set('sort', filtros.sort);

    // ⚠️ Aquí NO existe búsqueda por texto: el backend valida la query con
    // `PaginationQueryDto` (sólo `page`/`limit`/`sort`) y
    // `forbidNonWhitelisted: true`, así que un `?q=…` responde 400. El filtro de
    // `UsuariosPage` se aplica en memoria sobre la página cargada.

    // La API devuelve filas en snake_case (`SELECT *`); se mapean antes de salir
    // del servicio para que el consumidor sólo vea `Usuario`.
    const res = await api.get<unknown, Paginated<BackendUsuario>>(
      `/usuarios?${params.toString()}`,
    );

    return { ...res, data: (res.data ?? []).map(toUsuario) };
  },

  crear: async (input: CrearUsuarioInput): Promise<{ usuario_id: number }> => {
    const res = await api.post<unknown, ApiSuccess<{ usuario_id: number }>>(
      '/usuarios',
      toBackendCreatePayload(input),
    );
    return res.data;
  },

  actualizar: async (
    id: number,
    input: ActualizarUsuarioInput,
  ): Promise<{ usuario_id: number; actualizado: true }> => {
    const res = await api.patch<
      unknown,
      ApiSuccess<{ usuario_id: number; actualizado: true }>
    >(`/usuarios/${id}`, toBackendUpdatePayload(input));
    return res.data;
  },

  desactivar: async (id: number): Promise<{ usuario_id: number; activo: false }> => {
    const res = await api.delete<
      unknown,
      ApiSuccess<{ usuario_id: number; activo: false }>
    >(`/usuarios/${id}`);
    return res.data;
  },

  /**
   * G16-v2 · Invitar usuario: crea la cuenta en Supabase Auth, envía el correo y
   * registra el perfil. Es el alta que usa la UI (`POST /usuarios/invitar`), porque
   * `POST /usuarios` (`crear_usuario` sin `auth_user_id`) dejaría una fila sin
   * cuenta de Auth, incapaz de iniciar sesión.
   *
   * El DTO de invitación sólo acepta `nombre`, `email` y `rol`, así que `activo`
   * no se envía: la cuenta nace activa.
   */
  invitar: async (
    input: CrearUsuarioInput,
  ): Promise<{ usuario_id: number; auth_user_id: string; invitacion_enviada: true }> => {
    const res = await api.post<
      unknown,
      ApiSuccess<{ usuario_id: number; auth_user_id: string; invitacion_enviada: true }>
    >('/usuarios/invitar', {
      nombre: input.nombre,
      email: input.email,
      rol: input.rol,
      ...(input.colaborador_id ? { colaborador_id: input.colaborador_id } : {}),
    });
    return res.data;
  },
};

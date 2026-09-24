import { api, type ApiResponse, type ApiSuccess } from './api';
import type {
  BackendUsuario,
  Usuario,
  CrearUsuarioInput,
  ActualizarUsuarioInput,
} from '../types/usuario.types';

type PaginatedUsuarios = ApiSuccess<BackendUsuario[]>;

export type ListarUsuariosFiltros = {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
function toUsuario(b: BackendUsuario): Usuario {
  return {
    id: b.id,
    nombre: b.nombre,
    email: b.email,
    rol: b.rol,
    activo: b.activo,
    authUserId: b.auth_user_id,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

function toBackendCreatePayload(input: CrearUsuarioInput) {
  return {
    nombre: input.nombre,
    email: input.email,
    rol: input.rol,
    activo: input.activo ?? true,
    auth_user_id: input.auth_user_id ?? null,
  };
}

function toBackendUpdatePayload(input: ActualizarUsuarioInput) {
  return {
    nombre: input.nombre ?? null,
    rol: input.rol ?? null,
    activo: input.activo ?? null,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const UsuariosService = {
  listar: async (filtros: ListarUsuariosFiltros = {}): Promise<PaginatedUsuarios> => {
    const params = new URLSearchParams();
    if (filtros.page) params.set('page', String(filtros.page));
    if (filtros.limit) params.set('limit', String(filtros.limit));
    if (filtros.sort) params.set('sort', filtros.sort);
    if (filtros.q) params.set('q', filtros.q);

    const res = await api.get<unknown, PaginatedUsuarios>(
      `/usuarios?${params.toString()}`,
    );
    return { ...res, data: (res.data ?? []).map(toUsuario) };
  },

  crear: async (input: CrearUsuarioInput): Promise<{ usuario_id: number }> => {
    const res = await api.post<unknown, ApiResponse<{ usuario_id: number }>>(
      '/usuarios',
      toBackendCreatePayload(input),
    );
    if (!res.success) throw res;
    return res.data;
  },

  actualizar: async (
    id: number,
    input: ActualizarUsuarioInput,
  ): Promise<{ usuario_id: number; actualizado: true }> => {
    const res = await api.patch<
      unknown,
      ApiResponse<{ usuario_id: number; actualizado: true }>
    >(`/usuarios/${id}`, toBackendUpdatePayload(input));
    if (!res.success) throw res;
    return res.data;
  },

  desactivar: async (id: number): Promise<{ usuario_id: number; activo: false }> => {
    const res = await api.delete<
      unknown,
      ApiResponse<{ usuario_id: number; activo: false }>
    >(`/usuarios/${id}`);
    if (!res.success) throw res;
    return res.data;
  },


// src/services/usuarios.service.ts
// AÑADIR al objeto UsuariosService (junto a crear/actualizar/desactivar)

  invitar: async (input: CrearUsuarioInput): Promise<{ usuario_id: number; auth_user_id: string; invitacion_enviada: true }> => {
    const res = await api.post<
      unknown,
      ApiResponse<{ usuario_id: number; auth_user_id: string; invitacion_enviada: true }>
    >('/usuarios/invitar', {
      nombre: input.nombre,
      email: input.email,
      rol: input.rol,
    });
    if (!res.success) throw res;
    return res.data;
  },


};
// src/services/colaboradores.service.ts
import { api, type ApiResponse, type ApiSuccess } from './api';
import type {
  BackendColaborador,
  Colaborador,
  CrearColaboradorInput,
  ActualizarColaboradorInput,
} from '../types/colaborador.types';

type PaginatedColaboradores = ApiSuccess<BackendColaborador[]>;

export type ListarFiltros = {
  page?: number;
  limit?: number;
  sort?: string;
  activo?: boolean;
  q?: string;
};

// ---------------------------------------------------------------------------
// Mappers snake_case ↔ camelCase
// ---------------------------------------------------------------------------
function toColaborador(b: BackendColaborador): Colaborador {
  return {
    id: b.id,
    nombre: b.nombre,
    telefono: b.telefono,
    porcentajeComision: b.porcentaje_comision,
    area: b.area,
    fechaIngreso: b.fecha_ingreso,
    notas: b.notas,
    activo: b.activo,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

function toBackendCreatePayload(input: CrearColaboradorInput) {
  return {
    nombre: input.nombre,
    telefono: input.telefono || null,
    porcentaje_comision: input.porcentajeComision,
    activo: input.activo ?? true,
    area: input.area || null,
    fecha_ingreso: input.fechaIngreso || null,
    notas: input.notas || null,
  };
}

function toBackendUpdatePayload(input: ActualizarColaboradorInput) {
  return {
    nombre: input.nombre ?? null,
    telefono: input.telefono ?? null,
    porcentaje_comision: input.porcentajeComision ?? null,
    activo: input.activo ?? null,
    area: input.area ?? null,
    fecha_ingreso: input.fechaIngreso ?? null,
    notas: input.notas ?? null,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const ColaboradoresService = {
  listar: async (filtros: ListarFiltros = {}): Promise<PaginatedColaboradores> => {
    const params = new URLSearchParams();
    if (filtros.page) params.set('page', String(filtros.page));
    if (filtros.limit) params.set('limit', String(filtros.limit));
    if (filtros.sort) params.set('sort', filtros.sort);
    if (filtros.activo !== undefined) params.set('activo', String(filtros.activo));
    if (filtros.q) params.set('q', filtros.q);

    const res = await api.get<unknown, PaginatedColaboradores>(
      `/colaboradores?${params.toString()}`,
    );

    // Normaliza cada fila
    return { ...res, data: (res.data ?? []).map(toColaborador) };
  },

//   obtener: async (id: number): Promise<Colaborador> => {
//     const res = await api.get<unknown, ApiResponse<BackendColaborador>>(
//       `/colaboradores/${id}`,
//     );
//     if (!res.success) throw res;
//     return toColaborador(res.data);
//   },

  crear: async (input: CrearColaboradorInput): Promise<{ colaborador_id: number }> => {
    const res = await api.post<unknown, ApiResponse<{ colaborador_id: number }>>(
      '/colaboradores',
      toBackendCreatePayload(input),
    );
    if (!res.success) throw res;
    return res.data;
  },

  actualizar: async (
    id: number,
    input: ActualizarColaboradorInput,
  ): Promise<{ colaborador_id: number; actualizado: true }> => {
    const res = await api.patch<
      unknown,
      ApiResponse<{ colaborador_id: number; actualizado: true }>
    >(`/colaboradores/${id}`, toBackendUpdatePayload(input));
    if (!res.success) throw res;
    return res.data;
  },

  desactivar: async (
    id: number,
  ): Promise<{ colaborador_id: number; activo: false }> => {
    const res = await api.delete<
      unknown,
      ApiResponse<{ colaborador_id: number; activo: false }>
    >(`/colaboradores/${id}`);
    if (!res.success) throw res;
    return res.data;
  },
};
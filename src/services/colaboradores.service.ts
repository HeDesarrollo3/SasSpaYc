// src/services/colaboradores.service.ts
import { api, type ApiResponse, type Paginated } from './api';
import {
  PORCENTAJE_REFERIDO_DEFECTO,
  esAreaCabello,
  finPruebaPorDefecto,
} from '../types/colaborador.types';
import type {
  BackendColaborador,
  Colaborador,
  CrearColaboradorInput,
  ActualizarColaboradorInput,
} from '../types/colaborador.types';

/**
 * El listado ya viene **mapeado a camelCase**: el tipo declara `Colaborador[]`,
 * no `BackendColaborador[]`. Antes el alias decía `BackendColaborador[]`, así que
 * TypeScript creía que el hook devolvía filas crudas aunque el mapper sí se
 * ejecutaba. Ese desajuste rompía `ColaboradoresPage` y ocultaba el contrato real.
 */
type PaginatedColaboradores = Paginated<Colaborador>;

export type ListarFiltros = {
  page?: number;
  limit?: number;
  sort?: string;
  activo?: boolean;
  /** Filtro por área (nombre exacto). El DTO del backend ya lo acepta. */
  area?: string;
  /** Búsqueda por nombre (contiene, `ilike`). */
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
    pruebaHasta: b.prueba_hasta ?? null,
    sueldoPruebaMensual: b.sueldo_prueba_mensual ?? null,
    porcentajeReferido: b.porcentaje_referido ?? null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

/**
 * Campos de pago (migración 023). Se mandan siempre que el formulario los trae:
 * `null` saca de la prueba o quita el régimen de referido.
 */
function camposPago(input: ActualizarColaboradorInput) {
  if (input.enPrueba === undefined) return {};
  const digitos = (v?: string) => (v ?? '').replace(/[^\d]/g, '');
  return {
    prueba_hasta: input.enPrueba
      ? input.pruebaHasta || finPruebaPorDefecto(input.fechaIngreso || null)
      : null,
    sueldo_prueba_mensual:
      input.enPrueba && digitos(input.sueldoPrueba) ? Number(digitos(input.sueldoPrueba)) : null,
    // Cabello: por defecto 60 % colaborador / 40 % spa; se cambia según el trato.
    porcentaje_referido: esAreaCabello(input.area)
      ? Number(input.porcentajeReferido || PORCENTAJE_REFERIDO_DEFECTO)
      : null,
  };
}

/** Payload de alta: SIEMPRE snake_case (contrato `CrearColaboradorDto`). */
function toBackendCreatePayload(input: CrearColaboradorInput) {
  return {
    nombre: input.nombre,
    telefono: input.telefono || null,
    porcentaje_comision: input.porcentajeComision,
    activo: input.activo ?? true,
    area: input.area || null,
    fecha_ingreso: input.fechaIngreso || null,
    notas: input.notas || null,
    ...camposPago(input),
  };
}

/** Payload de edición: SIEMPRE snake_case (contrato `ActualizarColaboradorDto`). */
function toBackendUpdatePayload(input: ActualizarColaboradorInput) {
  return {
    nombre: input.nombre ?? null,
    telefono: input.telefono ?? null,
    porcentaje_comision: input.porcentajeComision ?? null,
    activo: input.activo ?? null,
    area: input.area ?? null,
    fecha_ingreso: input.fechaIngreso ?? null,
    notas: input.notas ?? null,
    ...camposPago(input),
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
    if (filtros.area) params.set('area', filtros.area);
    if (filtros.q) params.set('q', filtros.q);

    // La API devuelve filas en snake_case (`BackendColaborador`); se mapean antes
    // de salir del servicio para que el consumidor sólo vea `Colaborador`.
    const res = await api.get<unknown, Paginated<BackendColaborador>>(
      `/colaboradores?${params.toString()}`,
    );

    return { ...res, data: (res.data ?? []).map(toColaborador) };
  },

  // ⚠️ No existe `GET /colaboradores/:id` en el backend (ver
  // `colaboradores.controller.ts`: sólo listar, crear, actualizar y desactivar).
  // Cuando se añada, aquí va `obtener(id)` con `toColaborador`.

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

  desactivar: async (id: number): Promise<{ colaborador_id: number; activo: false }> => {
    const res = await api.delete<unknown, ApiResponse<{ colaborador_id: number; activo: false }>>(
      `/colaboradores/${id}`,
    );
    if (!res.success) throw res;
    return res.data;
  },
};

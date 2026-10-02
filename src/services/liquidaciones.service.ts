// src/services/liquidaciones.service.ts
import { api, postIdempotent, type ApiSuccess, type Paginated } from './api';

/**
 * Liquidaciones de colaboradores: comisiones devengadas de un periodo, su
 * aprobación, su pago (idempotente) y su anulación.
 *
 * Contrato real verificado contra la base de Supabase
 * (`docs/03-ESQUEMA-VERIFICADO.md` §1.5) y contra el backend
 * (`colaboradores.controller.ts`):
 *
 * - Los campos llegan en **snake_case** y los ids son **numéricos**.
 * - El listado viene paginado con `{ data, meta }`.
 * - El detalle (`obtener`) trae además `detalles` y `pagos` en el mismo objeto.
 * - `total_ventas` es la **cantidad** de ventas/ítems liquidados, **no** un importe.
 * - El backend **no** devuelve el saldo: es `total_pagar − monto_pagado`, que
 *   calcula el cliente (aquí no se inventa un campo que no existe).
 *
 * ⚠️ Los estados (`PENDIENTE`, `APROBADA`, `PAGADA`,
 * `ANULADA`) son los que maneja el backend; el único observado en la base es
 * `PAGADA`. Si llega uno desconocido se muestra tal cual con badge neutro
 * (`metaEstado`), nunca se rompe.
 */

// ---------------------------------------------------------------------------
// Tipos del backend (tal como llegan)
// ---------------------------------------------------------------------------
export interface Liquidacion {
  id: number;
  colaborador_id: number;
  /** `YYYY-MM-DD` (date de Postgres, sin hora). */
  periodo_inicio: string;
  periodo_fin: string;
  /** Cantidad de ventas/ítems incluidos en la liquidación — no es un importe. */
  total_ventas: number;
  total_comisiones: number;
  ajustes: number;
  total_pagar: number;
  monto_pagado: number;
  /** Sueldo de período de prueba incluido (migración 023). */
  sueldo_base?: number;
  dias_sueldo?: number;
  estado: string;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** Línea de `liquidacion_detalles`: lo que el colaborador firma. */
export interface LiquidacionDetalle {
  id: number;
  liquidacion_id: number;
  venta_id: number;
  base_comision: number;
  porcentaje_comision: number;
  valor_comision: number;
  created_at: string;
}

/** Fila de `pagos_colaboradores`. */
export interface PagoColaborador {
  id: number;
  liquidacion_id: number;
  cuenta_financiera_id: number | null;
  fecha_hora: string;
  monto: number;
  forma_pago: string;
  referencia: string | null;
  notas: string | null;
  created_at: string;
}

/** Cabecera + líneas + pagos, como los devuelve `GET /liquidaciones/:id`. */
export interface LiquidacionCompleta extends Liquidacion {
  detalles: LiquidacionDetalle[];
  pagos: PagoColaborador[];
}

// ---------------------------------------------------------------------------
// Entradas del frontend (camelCase → se traducen a snake_case al enviar)
// ---------------------------------------------------------------------------
export interface ListarLiquidacionesFiltros {
  colaboradorId?: number;
  estado?: string;
  /** Periodos que empiezan en o después de esta fecha (`YYYY-MM-DD`). */
  periodoDesde?: string;
  /** Periodos que terminan en o antes de esta fecha (`YYYY-MM-DD`). */
  periodoHasta?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

/** Comisiones aún sin liquidar de un colaborador (`GET …/liquidaciones/pendientes`). */
export interface ComisionPendiente {
  colaborador_id: number;
  cantidad_ventas: number;
  comision_pendiente: number;
  /** Sueldo de prueba aún no liquidado (migración 023). */
  sueldo_pendiente?: number;
  dias_sueldo?: number;
  /** Primer y último día (Colombia, `YYYY-MM-DD`) con comisiones pendientes. */
  desde: string;
  hasta: string;
}

export interface CrearLiquidacionInput {
  colaboradorId: number;
  /** `YYYY-MM-DD`, inclusivo. */
  periodoInicio: string;
  periodoFin: string;
  /** Positivo = a favor del colaborador; negativo = descuento o adelanto. */
  ajustes?: number;
  notas?: string;
}

export interface RegistrarPagoLiquidacionInput {
  monto: number;
  /** `EFECTIVO` | `TARJETA` | `TRANSFERENCIA` (MAYÚSCULAS, como en la BD). */
  formaPago: string;
  cuentaFinancieraId: number;
  referencia?: string;
  notas?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const LiquidacionesService = {
  /**
   * `GET /colaboradores/liquidaciones` — colección paginada.
   *
   * Si el rol es `colaborador`, el backend fuerza su propio `colaborador_id`
   * aunque se envíe otro: el filtro se aplica en el servidor.
   */
  listar: async (filtros: ListarLiquidacionesFiltros = {}): Promise<Paginated<Liquidacion>> => {
    const qs = new URLSearchParams();
    if (filtros.colaboradorId !== undefined) {
      qs.set('colaborador_id', String(filtros.colaboradorId));
    }
    if (filtros.estado) qs.set('estado', filtros.estado);
    if (filtros.periodoDesde) qs.set('periodo_desde', filtros.periodoDesde);
    if (filtros.periodoHasta) qs.set('periodo_hasta', filtros.periodoHasta);
    qs.set('page', String(filtros.page ?? 1));
    qs.set('limit', String(filtros.limit ?? 20));
    // `-periodo_inicio` = más recientes primero (`parseSortParam` del backend).
    qs.set('sort', filtros.sort ?? '-periodo_inicio');

    return api.get<unknown, Paginated<Liquidacion>>(`/colaboradores/liquidaciones?${qs}`);
  },

  /** `GET /colaboradores/liquidaciones/pendientes` — panel «Por liquidar». */
  pendientes: async (): Promise<ComisionPendiente[]> => {
    const res = await api.get<unknown, ApiSuccess<ComisionPendiente[]>>(
      '/colaboradores/liquidaciones/pendientes',
    );
    return res.data ?? [];
  },

  /** `GET /colaboradores/liquidaciones/:id` — cabecera + `detalles` + `pagos`. */
  obtener: async (id: number): Promise<LiquidacionCompleta> => {
    const res = await api.get<unknown, ApiSuccess<LiquidacionCompleta>>(
      `/colaboradores/liquidaciones/${id}`,
    );
    return res.data;
  },

  /** `POST /colaboradores/liquidaciones` — RPC `crear_liquidacion_colaborador`. */
  crear: async (input: CrearLiquidacionInput): Promise<{ liquidacion_id: number }> => {
    const res = await api.post<unknown, ApiSuccess<{ liquidacion_id: number }>>(
      '/colaboradores/liquidaciones',
      {
        colaborador_id: input.colaboradorId,
        periodo_inicio: input.periodoInicio,
        periodo_fin: input.periodoFin,
        ajustes: input.ajustes ?? null,
        notas: input.notas ?? null,
      },
    );
    return res.data;
  },

  /** `POST /colaboradores/liquidaciones/:id/aprobar` — `PENDIENTE → APROBADA`. */
  aprobar: async (id: number): Promise<{ liquidacion_id: number; estado: string }> => {
    const res = await api.post<unknown, ApiSuccess<{ liquidacion_id: number; estado: string }>>(
      `/colaboradores/liquidaciones/${id}/aprobar`,
    );
    return res.data;
  },

  /**
   * `POST /colaboradores/liquidaciones/:id/pagos` — **idempotente**.
   *
   * ⚠️ La `idempotencyKey` se genera **una sola vez al abrir el drawer** y se
   * reutiliza en todos los reintentos: regenerarla en cada clic anula la
   * protección contra el doble pago.
   */
  registrarPago: async (
    id: number,
    input: RegistrarPagoLiquidacionInput,
    idempotencyKey?: string,
  ): Promise<{ pago_id: number }> => {
    const res = await postIdempotent<{ pago_id: number }>(
      `/colaboradores/liquidaciones/${id}/pagos`,
      {
        monto: input.monto,
        forma_pago: input.formaPago,
        cuenta_financiera_id: input.cuentaFinancieraId,
        referencia: input.referencia ?? null,
        notas: input.notas ?? null,
      },
      idempotencyKey,
    );
    return res.data;
  },

  /**
   * `POST /colaboradores/liquidaciones/:id/anular` — libera las líneas para
   * poder volver a liquidarlas. No se permite sobre una liquidación pagada.
   */
  anular: async (
    id: number,
    motivo?: string,
  ): Promise<{ liquidacion_id: number; estado: string }> => {
    const res = await api.post<unknown, ApiSuccess<{ liquidacion_id: number; estado: string }>>(
      `/colaboradores/liquidaciones/${id}/anular`,
      { motivo: motivo ?? null },
    );
    return res.data;
  },
};

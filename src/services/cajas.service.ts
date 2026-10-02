// src/services/cajas.service.ts
import { api, type ApiSuccess } from './api';
import { toSnake } from '../lib/snake';

/**
 * Caja: apertura, movimientos, arqueo y cierre.
 *
 * ⚠️ **Este servicio estaba roto de punta a punta.** Enviaba `camelCase`
 * (`montoInicial`, `montoFinal`, `motivo`) mientras los DTO del backend exigen
 * `snake_case` (`saldo_inicial`, `saldo_real`, `concepto`). Con
 * `forbidNonWhitelisted: true` eso era un `400 VALIDATION_ERROR` en cada intento.
 * Además `registrarMovimiento` no enviaba `caja_id` (obligatorio) y los tipos de
 * movimiento iban en mayúsculas mixtas.
 *
 * Los tipos de abajo reflejan **exactamente** las columnas de `public.cajas` y
 * `public.movimientos_caja` verificadas contra Supabase.
 */

export type EstadoCaja = 'ABIERTA' | 'CERRADA';
export type TipoMovimientoCaja = 'INGRESO' | 'EGRESO';

export interface Caja {
  id: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  colaborador_apertura_id: number | null;
  colaborador_cierre_id: number | null;
  saldo_inicial: number;
  /** Lo que el sistema calcula que debería haber. */
  saldo_esperado: number;
  /** Lo que el cajero contó físicamente (null mientras está abierta). */
  saldo_real: number | null;
  /** `saldo_real − saldo_esperado`. `null` mientras está abierta. */
  diferencia: number | null;
  estado: EstadoCaja;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovimientoCaja {
  id: number;
  caja_id: number;
  venta_id: number | null;
  colaborador_id: number | null;
  fecha_hora: string;
  tipo_movimiento: TipoMovimientoCaja;
  concepto: string;
  forma_pago: string | null;
  monto: number;
  observaciones: string | null;
  created_at: string;
}

/** Desglose por forma de pago que devuelve `GET /cajas/:id/resumen`. */
export interface DesgloseFormaPago {
  cantidad: number;
  total: number;
  EFECTIVO: number;
  TARJETA: number;
  TRANSFERENCIA: number;
}

/** Arqueo en vivo calculado en el servidor. No se recalcula en el cliente. */
export interface ResumenCaja {
  caja_id: number;
  estado: EstadoCaja;
  fecha_apertura: string;
  fecha_cierre: string | null;
  colaborador_apertura_id: number | null;
  colaborador_cierre_id: number | null;
  saldo_inicial: number;
  movimientos: { ingresos: DesgloseFormaPago; egresos: DesgloseFormaPago };
  propinas: number;
  esperado: { EFECTIVO: number; TARJETA: number; TRANSFERENCIA: number; total: number };
  saldo_real: number | null;
  diferencia: number | null;
  saldo_esperado_guardado: number | null;
  diferencia_guardada: number | null;
  observaciones: string | null;
  puede_cerrar: boolean;
  movimientos_cantidad: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entradas (lo que arma la UI). En camelCase; se convierten a snake_case abajo.
// ─────────────────────────────────────────────────────────────────────────────

export interface AperturaCajaInput {
  saldoInicial: number;
  /** Quién abre la caja. Sin esto no hay responsable del arqueo. */
  colaboradorId?: number;
  observaciones?: string;
}

export interface MovimientoCajaInput {
  cajaId: number;
  tipoMovimiento: TipoMovimientoCaja;
  monto: number;
  concepto: string;
  /** Obligatorio para que el cuadre se desglose por forma de pago. */
  formaPago: string;
  colaboradorId?: number;
  observaciones?: string;
}

export interface CierreCajaInput {
  /** Efectivo contado físicamente. El backend lo recibe como `p_saldo_real`. */
  saldoReal: number;
  colaboradorId?: number;
  /** Obligatorio si el arqueo presenta diferencia. */
  observaciones?: string;
}

type Paginado<T> = ApiSuccess<T[]> & {
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export const CajasService = {
  /** `GET /cajas` — paginado, con filtro por estado. */
  listar: async (params: { estado?: EstadoCaja; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.estado) qs.set('estado', params.estado);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    qs.set('sort', '-fecha_apertura');

    const res = await api.get<unknown, Paginado<Caja>>(`/cajas?${qs}`);
    return res;
  },

  /**
   * `GET /cajas/abierta` — la caja abierta, o `null`.
   *
   * Antes la UI tomaba "la primera de la lista" y asumía que estaba abierta:
   * funcionaba por accidente y se rompía con varias cajas históricas.
   */
  obtenerAbierta: async (): Promise<Caja | null> => {
    const res = await api.get<unknown, ApiSuccess<Caja | null>>('/cajas/abierta');
    return res.data ?? null;
  },

  /** `GET /cajas/:id/movimientos` — paginado. */
  listarMovimientos: async (cajaId: number, page = 1, limit = 50) => {
    const res = await api.get<unknown, Paginado<MovimientoCaja>>(
      `/cajas/${cajaId}/movimientos?page=${page}&limit=${limit}&sort=-fecha_hora`,
    );
    return res;
  },

  /** `GET /cajas/:id/resumen` — arqueo en vivo (todo el cálculo viene del servidor). */
  obtenerResumen: async (cajaId: number): Promise<ResumenCaja> => {
    const res = await api.get<unknown, ApiSuccess<ResumenCaja>>(`/cajas/${cajaId}/resumen`);
    return res.data;
  },

  /** `POST /cajas/apertura` */
  aperturar: async (input: AperturaCajaInput): Promise<{ caja_id: number }> => {
    const res = await api.post<unknown, ApiSuccess<{ caja_id: number }>>(
      '/cajas/apertura',
      toSnake({
        saldoInicial: input.saldoInicial,
        colaboradorId: input.colaboradorId,
        observaciones: input.observaciones || null,
      }),
    );
    return res.data;
  },

  /** `POST /cajas/movimientos` */
  registrarMovimiento: async (input: MovimientoCajaInput): Promise<{ movimiento_id: number }> => {
    const res = await api.post<unknown, ApiSuccess<{ movimiento_id: number }>>(
      '/cajas/movimientos',
      toSnake({
        cajaId: input.cajaId,
        tipoMovimiento: input.tipoMovimiento,
        monto: input.monto,
        concepto: input.concepto,
        formaPago: input.formaPago,
        colaboradorId: input.colaboradorId,
        observaciones: input.observaciones || null,
      }),
    );
    return res.data;
  },

  /** `POST /cajas/:id/cierre` */
  cerrar: async (cajaId: number, input: CierreCajaInput): Promise<unknown> => {
    const res = await api.post<unknown, ApiSuccess<unknown>>(
      `/cajas/${cajaId}/cierre`,
      toSnake({
        saldoReal: input.saldoReal,
        colaboradorId: input.colaboradorId,
        observaciones: input.observaciones || null,
      }),
    );
    return res.data;
  },
};

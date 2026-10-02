// src/services/cuentas.service.ts
import { api, postIdempotent, type ApiSuccess, type Paginated } from './api';

/**
 * Cuentas por cobrar (crédito a clientes) y por pagar (proveedores).
 *
 * ⚠️ **Estaba roto:** `registrarAbonoCliente` y `registrarPagoProveedor` enviaban
 * sólo `{ monto }`, pero los DTO del backend exigen además `forma_pago` y
 * `cuenta_financiera_id`. Resultado: `400 VALIDATION_ERROR` en cada intento.
 *
 * ⚠️ El alta de cuenta por pagar se llamaba con `proveedor`; el parámetro real de
 * la RPC es `p_beneficiario`.
 */

export interface CuentaCobrar {
  id: number;
  venta_id: number | null;
  cliente_id: number;
  fecha_creacion: string;
  fecha_vencimiento: string | null;
  monto_total: number;
  monto_abonado: number;
  saldo_pendiente: number;
  /** `PENDIENTE` | `PARCIAL` | `PAGADA` | `VENCIDA` | `ANULADA` */
  estado: string;
  concepto: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface CuentaPagar {
  id: number;
  beneficiario: string;
  fecha_creacion: string;
  fecha_vencimiento: string | null;
  monto_total: number;
  monto_pagado: number;
  saldo_pendiente: number;
  estado: string;
  concepto: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** Datos comunes a un abono/pago: sin forma de pago ni cuenta no se puede registrar. */
export interface MovimientoCuentaInput {
  monto: number;
  /** `EFECTIVO` | `TARJETA` | `TRANSFERENCIA` (mayúsculas, como en la BD) */
  formaPago: string;
  cuentaFinancieraId: number;
  referencia?: string;
  notas?: string;
}

function aPayloadMovimiento(input: MovimientoCuentaInput) {
  return {
    monto: input.monto,
    forma_pago: input.formaPago,
    cuenta_financiera_id: input.cuentaFinancieraId,
    referencia: input.referencia ?? null,
    notas: input.notas ?? null,
  };
}

export const CuentasService = {
  // ── Por cobrar ────────────────────────────────────────────────────────────
  listarCobrar: async (params: { estado?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.estado) qs.set('estado', params.estado);
    qs.set('page', String(params.page ?? 1));
    qs.set('limit', String(params.limit ?? 50));
    qs.set('sort', '-fecha_creacion');
    return api.get<unknown, Paginated<CuentaCobrar>>(`/cuentas-cobrar?${qs}`);
  },

  /** `POST /cuentas-cobrar/:id/abonos` — idempotente. */
  registrarAbono: async (
    cuentaId: number,
    input: MovimientoCuentaInput,
    idempotencyKey?: string,
  ): Promise<{ abono_id: number }> => {
    const res = await postIdempotent<{ abono_id: number }>(
      `/cuentas-cobrar/${cuentaId}/abonos`,
      aPayloadMovimiento(input),
      idempotencyKey,
    );
    return res.data;
  },

  crearCobrar: async (input: {
    clienteId: number;
    montoTotal: number;
    ventaId?: number;
    concepto?: string;
    fechaVencimiento?: string;
    notas?: string;
  }): Promise<{ cuenta_cobrar_id: number }> => {
    const res = await api.post<unknown, ApiSuccess<{ cuenta_cobrar_id: number }>>(
      '/cuentas-cobrar',
      {
        cliente_id: input.clienteId,
        monto_total: input.montoTotal,
        venta_id: input.ventaId ?? null,
        concepto: input.concepto ?? null,
        fecha_vencimiento: input.fechaVencimiento ?? null,
        notas: input.notas ?? null,
      },
    );
    return res.data;
  },

  // ── Por pagar ─────────────────────────────────────────────────────────────
  listarPagar: async (params: { estado?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.estado) qs.set('estado', params.estado);
    qs.set('page', String(params.page ?? 1));
    qs.set('limit', String(params.limit ?? 50));
    qs.set('sort', '-fecha_creacion');
    return api.get<unknown, Paginated<CuentaPagar>>(`/cuentas-pagar?${qs}`);
  },

  /** `POST /cuentas-pagar/:id/pagos` — idempotente. */
  registrarPagoProveedor: async (
    cuentaId: number,
    input: MovimientoCuentaInput,
    idempotencyKey?: string,
  ): Promise<{ pago_id: number }> => {
    const res = await postIdempotent<{ pago_id: number }>(
      `/cuentas-pagar/${cuentaId}/pagos`,
      aPayloadMovimiento(input),
      idempotencyKey,
    );
    return res.data;
  },

  crearPagar: async (input: {
    /** ⚠️ `beneficiario`, no `proveedor`: es el nombre real del parámetro. */
    beneficiario: string;
    montoTotal: number;
    concepto?: string;
    fechaVencimiento?: string;
    notas?: string;
  }): Promise<{ cuenta_pagar_id: number }> => {
    const res = await api.post<unknown, ApiSuccess<{ cuenta_pagar_id: number }>>(
      '/cuentas-pagar',
      {
        beneficiario: input.beneficiario,
        monto_total: input.montoTotal,
        concepto: input.concepto ?? null,
        fecha_vencimiento: input.fechaVencimiento ?? null,
        notas: input.notas ?? null,
      },
    );
    return res.data;
  },
};

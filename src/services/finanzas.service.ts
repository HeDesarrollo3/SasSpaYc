// src/services/finanzas.service.ts
import { api, type ApiSuccess, type Paginated } from './api';

/**
 * Cuentas financieras: el **origen/destino de cada pago** del sistema.
 *
 * ⚠️ **Este módulo no existía y bloqueaba todos los cobros.** Los endpoints de
 * pago (`/ventas/:id/pagos`, `/cuentas-cobrar/:id/abonos`,
 * `/cuentas-pagar/:id/pagos`, `/colaboradores/liquidaciones/:id/pagos`) exigen
 * `cuenta_financiera_id` como campo obligatorio, y no había forma de obtener esos
 * identificadores. Ahora `GET /finanzas/cuentas` los expone.
 *
 * La tabla ya existía en Supabase con 3 filas.
 */

export interface CuentaFinanciera {
  id: number;
  nombre: string;
  /** `EFECTIVO` | `BANCO` | `BILLETERA_DIGITAL` | `TARJETA` | `OTRO` */
  tipo: string;
  numero_referencia: string | null;
  saldo_inicial: number;
  saldo_actual: number;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrearCuentaFinancieraInput {
  nombre: string;
  tipo: string;
  numeroReferencia?: string;
  saldoInicial?: number;
  notas?: string;
}

export const FinanzasService = {
  /** `GET /finanzas/cuentas` — sólo activas por defecto, para los selectores de pago. */
  listar: async (
    params: { activo?: boolean; tipo?: string; page?: number; limit?: number } = {},
  ): Promise<CuentaFinanciera[]> => {
    const qs = new URLSearchParams();
    qs.set('activo', String(params.activo ?? true));
    if (params.tipo) qs.set('tipo', params.tipo);
    qs.set('page', String(params.page ?? 1));
    qs.set('limit', String(params.limit ?? 100));
    qs.set('sort', 'nombre');

    const res = await api.get<unknown, Paginated<CuentaFinanciera>>(
      `/finanzas/cuentas?${qs}`,
    );
    return res.data ?? [];
  },

  obtener: async (id: number): Promise<CuentaFinanciera> => {
    const res = await api.get<unknown, ApiSuccess<CuentaFinanciera>>(
      `/finanzas/cuentas/${id}`,
    );
    return res.data;
  },

  crear: async (input: CrearCuentaFinancieraInput): Promise<{ cuenta_financiera_id: number }> => {
    const res = await api.post<unknown, ApiSuccess<{ cuenta_financiera_id: number }>>(
      '/finanzas/cuentas',
      {
        nombre: input.nombre,
        tipo: input.tipo,
        numero_referencia: input.numeroReferencia ?? null,
        saldo_inicial: input.saldoInicial ?? 0,
        notas: input.notas ?? null,
      },
    );
    return res.data;
  },

  actualizar: async (
    id: number,
    cambios: Partial<CrearCuentaFinancieraInput> & { activo?: boolean },
  ): Promise<{ cuenta_financiera_id: number; actualizado: boolean }> => {
    const res = await api.patch<
      unknown,
      ApiSuccess<{ cuenta_financiera_id: number; actualizado: boolean }>
    >(`/finanzas/cuentas/${id}`, {
      nombre: cambios.nombre,
      tipo: cambios.tipo,
      numero_referencia: cambios.numeroReferencia,
      notas: cambios.notas,
      activo: cambios.activo,
    });
    return res.data;
  },

  /** `POST /finanzas/cuentas/:id/ajustar-saldo` — fija el saldo real (queda en auditoría). */
  ajustarSaldo: async (
    id: number,
    saldoReal: number,
    motivo: string,
  ): Promise<{ saldo_anterior: number; saldo_actual: number; diferencia: number }> => {
    const res = await api.post<
      unknown,
      ApiSuccess<{ saldo_anterior: number; saldo_actual: number; diferencia: number }>
    >(`/finanzas/cuentas/${id}/ajustar-saldo`, { saldo_real: saldoReal, motivo });
    return res.data;
  },
};

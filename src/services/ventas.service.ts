// src/services/ventas.service.ts
import { api, postIdempotent, type ApiSuccess, type Paginated } from './api';

/**
 * Ventas.
 *
 * ⚠️ El `CrearVentaDto` del backend tiene exactamente estos campos
 * (`producto_servicio_id`, `cantidad`, `precio_unitario`, `descuento`). Antes
 * `CheckoutModal` enviaba `productoId`/`servicioId`/`precioUnitario`, que no
 * existen en el DTO: `400 VALIDATION_ERROR` garantizado.
 */

export interface DetalleVenta {
  id: number;
  venta_id: number;
  /** `servicio` | `producto` (minúsculas en la BD) */
  tipo_item: string;
  servicio_id: number | null;
  producto_id: number | null;
  adicional_id: number | null;
  combo_id: number | null;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  promocion_id: number | null;
  created_at: string;
}

export interface PagoVenta {
  id: number;
  venta_id: number;
  cuenta_financiera_id: number | null;
  fecha_hora: string;
  monto: number;
  forma_pago: string;
  referencia: string | null;
  notas: string | null;
  created_at: string;
}

export interface Venta {
  id: number;
  /** ⚠️ `ventas` NO tiene `created_at`: su eje temporal es `fecha_hora`. */
  fecha_hora: string;
  colaborador_id: number | null;
  cliente_id: number | null;
  subtotal: number;
  descuento: number;
  total: number;
  /** `PENDIENTE` | `PARCIAL` | `PAGADA` | `CREDITO` | `ANULADA` */
  estado: string;
  notas: string | null;
}

export interface VentaDetalle extends Venta {
  detalles: DetalleVenta[];
  pagos: PagoVenta[];
}

/**
 * Línea de venta tal como la acepta el backend.
 *
 * Nota de diseño: el backend resolverá los precios desde el catálogo en la
 * versión definitiva (regla *Numeric Authority*). Mientras `crear_venta` siga
 * aceptando `precio_unitario`, lo enviamos; cuando se migre a la RPC v2, este
 * campo desaparece del payload.
 */
export interface DetalleVentaInput {
  producto_servicio_id: number;
  cantidad: number;
  precio_unitario: number;
  descuento?: number;
}

export interface CrearVentaInput {
  colaborador_id?: number;
  cliente_id?: number;
  detalles: DetalleVentaInput[];
  notas?: string;
}

export interface RegistrarPagoInput {
  monto: number;
  /** `EFECTIVO` | `TARJETA` | `TRANSFERENCIA` (mayúsculas, como en la BD) */
  formaPago: string;
  cuentaFinancieraId: number;
  referencia?: string;
  notas?: string;
}

export const VentasService = {
  /**
   * `POST /ventas` — **idempotente**.
   * Pasa siempre la misma `idempotencyKey` en los reintentos de una operación:
   * generarla en cada click anula la protección contra doble cobro.
   */
  crearVenta: async (
    input: CrearVentaInput,
    idempotencyKey?: string,
  ): Promise<{ venta_id: number }> => {
    const res = await postIdempotent<{ venta_id: number }>(
      '/ventas',
      {
        cliente_id: input.cliente_id ?? null,
        colaborador_id: input.colaborador_id,
        detalles: input.detalles,
        notas: input.notas ?? null,
      },
      idempotencyKey,
    );
    return res.data;
  },

  /** `POST /ventas/:id/pagos` — idempotente. */
  registrarPago: async (
    ventaId: number,
    input: RegistrarPagoInput,
    idempotencyKey?: string,
  ): Promise<{ pago_id: number }> => {
    const res = await postIdempotent<{ pago_id: number }>(
      `/ventas/${ventaId}/pagos`,
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

  listar: async (
    params: {
      estado?: string;
      desde?: string;
      hasta?: string;
      cliente_id?: number;
      colaborador_id?: number;
      page?: number;
      limit?: number;
      sort?: string;
    } = {},
  ): Promise<Paginated<Venta>> => {
    const qs = new URLSearchParams();
    if (params.estado) qs.set('estado', params.estado);
    if (params.desde) qs.set('desde', params.desde);
    if (params.hasta) qs.set('hasta', params.hasta);
    if (params.cliente_id) qs.set('cliente_id', String(params.cliente_id));
    if (params.colaborador_id) qs.set('colaborador_id', String(params.colaborador_id));
    qs.set('page', String(params.page ?? 1));
    qs.set('limit', String(params.limit ?? 20));
    // ⚠️ `fecha_hora`, no `created_at`: `ventas` no tiene esa columna.
    qs.set('sort', params.sort ?? '-fecha_hora');
    return api.get<unknown, Paginated<Venta>>(`/ventas?${qs}`);
  },

  /** `GET /ventas/:id` — detalle con líneas y pagos, para reimprimir el recibo. */
  obtener: async (id: number): Promise<VentaDetalle> => {
    const res = await api.get<unknown, ApiSuccess<VentaDetalle>>(`/ventas/${id}`);
    return res.data;
  },

  /** `GET /ventas/:id/comisiones` */
  comisiones: async (id: number): Promise<unknown> => {
    const res = await api.get<unknown, ApiSuccess<unknown>>(`/ventas/${id}/comisiones`);
    return res.data;
  },
};

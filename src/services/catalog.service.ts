// src/services/catalog.service.ts
import { api, type ApiSuccess, type Paginated } from './api';

/**
 * Catálogo unificado.
 *
 * ⚠️ **Antes el POS llamaba a `GET /catalogo`, que no existía** (sólo
 * `/catalogo/productos` y `/catalogo/servicios`). Como la llamada iba dentro de un
 * `Promise.all`, el `404` tumbaba también la carga de clientes y colaboradores y
 * el POS quedaba inservible.
 *
 * Ahora existe `GET /catalogo/items`, que devuelve los tres tipos normalizados.
 */

/** Los tres tipos de ítem que puede consumir el POS. */
export type TipoItemCatalogo = 'servicio' | 'producto' | 'adicional';

export interface ItemCatalogo {
  id: number;
  tipo: TipoItemCatalogo;
  nombre: string;
  precio: number;
  activo: boolean;
  /** Sólo servicios */
  categoria?: string | null;
  costo_insumo?: number | null;
  porcentaje_colaborador?: number | null;
  /**
   * Sólo servicios: `precio` | `precio_menos_insumo` (columna añadida en la
   * migración 004). Determina la **base** de la comisión, así que el portal la
   * necesita para estimar sin inventar.
   */
  comision_sobre?: 'precio' | 'precio_menos_insumo' | null;
  /** Precio variable (migración 024): rango permitido. `null` = precio fijo. */
  precio_min?: number | null;
  precio_max?: number | null;
  /** Sólo productos */
  stock_actual?: number | null;
  /** Sólo adicionales (= extras: costo adicional sobre un servicio) */
  genera_comision?: boolean | null;
  porcentaje_comision?: number | null;
  descripcion?: string | null;
}

export interface Servicio {
  id: number;
  categoria: string;
  nombre_servicio: string;
  precio: number;
  costo_insumo: number | null;
  porcentaje_colaborador: number | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Producto {
  id: number;
  nombre_producto: string;
  precio_venta: number;
  costo_compra: number | null;
  stock_actual: number;
  /** Llega con la migración 004. */
  activo?: boolean;
  categoria?: string | null;
  stock_minimo?: number | null;
  codigo_barras?: string | null;
  comisionable?: boolean;
  porcentaje_colaborador?: number | null;
}

/** `adicionales` es la tabla de **extras**: "servicio + costo adicional". */
export interface Adicional {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio_predeterminado: number;
  genera_comision: boolean;
  porcentaje_comision: number | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export const CatalogoService = {
  /**
   * `GET /catalogo/items` — servicios + productos + adicionales normalizados.
   * Es lo que debe usar el POS.
   */
  listarItems: async (soloActivos = true): Promise<ItemCatalogo[]> => {
    const res = await api.get<unknown, ApiSuccess<ItemCatalogo[]>>(
      `/catalogo/items?soloActivos=${soloActivos}`,
    );
    return res.data ?? [];
  },

  listarServicios: async (
    params: {
      activo?: boolean;
      categoria?: string;
      q?: string;
      page?: number;
      limit?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.activo !== undefined) qs.set('activo', String(params.activo));
    if (params.categoria) qs.set('categoria', params.categoria);
    if (params.q) qs.set('q', params.q);
    qs.set('page', String(params.page ?? 1));
    qs.set('limit', String(params.limit ?? 50));
    qs.set('sort', 'nombre_servicio');
    return api.get<unknown, Paginated<Servicio>>(`/catalogo/servicios?${qs}`);
  },

  listarProductos: async (
    params: {
      activo?: boolean;
      categoria?: string;
      q?: string;
      page?: number;
      limit?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.activo !== undefined) qs.set('activo', String(params.activo));
    if (params.categoria) qs.set('categoria', params.categoria);
    if (params.q) qs.set('q', params.q);
    qs.set('page', String(params.page ?? 1));
    qs.set('limit', String(params.limit ?? 50));
    qs.set('sort', 'nombre_producto');
    return api.get<unknown, Paginated<Producto>>(`/catalogo/productos?${qs}`);
  },

  // ── Altas (DEFINER, sólo administración) ──────────────────────────────────

  crearServicio: async (input: {
    categoria: string;
    nombreServicio: string;
    precio: number;
    costoInsumo?: number;
    porcentajeColaborador?: number;
    activo?: boolean;
  }): Promise<{ servicio_id: number }> => {
    const res = await api.post<unknown, ApiSuccess<{ servicio_id: number }>>(
      '/catalogo/servicios',
      {
        categoria: input.categoria,
        nombre_servicio: input.nombreServicio,
        precio: input.precio,
        costo_insumo: input.costoInsumo ?? null,
        porcentaje_colaborador: input.porcentajeColaborador ?? null,
        activo: input.activo ?? true,
      },
    );
    return res.data;
  },

  /** `PATCH /catalogo/servicios/:id` — endpoint creado en el F0 del backend. */
  actualizarServicio: async (
    id: number,
    cambios: Partial<{
      nombreServicio: string;
      categoria: string;
      precio: number;
      costoInsumo: number;
      porcentajeColaborador: number;
      duracionMinutos: number;
      comisionSobre: 'precio' | 'precio_menos_insumo';
      activo: boolean;
      /** Precio variable (migración 024). `null` = precio fijo. */
      precioMin: number | null;
      precioMax: number | null;
    }>,
  ): Promise<{ servicio_id: number; actualizado: boolean }> => {
    const res = await api.patch<unknown, ApiSuccess<{ servicio_id: number; actualizado: boolean }>>(
      `/catalogo/servicios/${id}`,
      {
        nombre_servicio: cambios.nombreServicio,
        categoria: cambios.categoria,
        precio: cambios.precio,
        costo_insumo: cambios.costoInsumo,
        porcentaje_colaborador: cambios.porcentajeColaborador,
        duracion_minutos: cambios.duracionMinutos,
        comision_sobre: cambios.comisionSobre,
        activo: cambios.activo,
        precio_min: cambios.precioMin,
        precio_max: cambios.precioMax,
      },
    );
    return res.data;
  },

  /** Soft delete del servicio: se conserva porque `detalle_ventas` lo referencia. */
  desactivarServicio: async (
    id: number,
  ): Promise<{ servicio_id: number; actualizado: boolean }> => {
    const res = await api.delete<
      unknown,
      ApiSuccess<{ servicio_id: number; actualizado: boolean }>
    >(`/catalogo/servicios/${id}`);
    return res.data;
  },

  /** `POST /catalogo/productos` — el DTO espera `nombre_producto`, no `nombre`. */
  crearProducto: async (input: {
    nombreProducto: string;
    precioVenta: number;
    stockActual: number;
    costoCompra?: number;
  }): Promise<{ producto_id: number }> => {
    const res = await api.post<unknown, ApiSuccess<{ producto_id: number }>>(
      '/catalogo/productos',
      {
        nombre_producto: input.nombreProducto,
        precio_venta: input.precioVenta,
        stock_actual: input.stockActual,
        costo_compra: input.costoCompra ?? null,
      },
    );
    return res.data;
  },

  /** `PATCH /catalogo/productos/:id` — endpoint creado en el F0 del backend. */
  actualizarProducto: async (
    id: number,
    cambios: Partial<{
      nombreProducto: string;
      precioVenta: number;
      costoCompra: number;
      stockActual: number;
      stockMinimo: number;
      categoria: string;
      codigoBarras: string;
      comisionable: boolean;
      porcentajeColaborador: number;
      activo: boolean;
    }>,
  ): Promise<{ producto_id: number; actualizado: boolean }> => {
    const res = await api.patch<unknown, ApiSuccess<{ producto_id: number; actualizado: boolean }>>(
      `/catalogo/productos/${id}`,
      {
        nombre_producto: cambios.nombreProducto,
        precio_venta: cambios.precioVenta,
        costo_compra: cambios.costoCompra,
        stock_actual: cambios.stockActual,
        stock_minimo: cambios.stockMinimo,
        categoria: cambios.categoria,
        codigo_barras: cambios.codigoBarras,
        comisionable: cambios.comisionable,
        porcentaje_colaborador: cambios.porcentajeColaborador,
        activo: cambios.activo,
      },
    );
    return res.data;
  },

  /** Soft delete: conserva el historial de ventas. */
  desactivarProducto: async (
    id: number,
  ): Promise<{ producto_id: number; actualizado: boolean }> => {
    const res = await api.delete<
      unknown,
      ApiSuccess<{ producto_id: number; actualizado: boolean }>
    >(`/catalogo/productos/${id}`);
    return res.data;
  },
};

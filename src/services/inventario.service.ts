// src/services/inventario.service.ts
//
// Este módulo era un duplicado parcial de `catalog.service.ts` y tenía dos bugs:
//   · `eliminar` construía `DELETE /catalogo/productos${id}` (sin `/`) y el
//     endpoint no existía.
//   · `crear` enviaba `{ nombre, codigo, precio, tipo, stock }`, que no coincide
//     con el DTO (`nombre_producto`, `precio_venta`, `stock_actual`).
//
// Se conserva como fachada para no romper los imports existentes, pero toda la
// lógica vive en `catalog.service.ts`.

export type { ItemCatalogo, Producto, Servicio, TipoItemCatalogo } from './catalog.service';
export { CatalogoService } from './catalog.service';

import { CatalogoService } from './catalog.service';

/** @deprecated Usar `CatalogoService` directamente. */
export const InventarioService = {
  /** @deprecated Usar `CatalogoService.listarItems()`. */
  listar: async () => CatalogoService.listarItems(true),

  /** @deprecated Usar `CatalogoService.crearProducto()`. */
  crear: async (input: {
    nombreProducto: string;
    precioVenta: number;
    stockActual: number;
    costoCompra?: number;
  }) => CatalogoService.crearProducto(input),

  /** @deprecated Usar `CatalogoService.desactivarProducto()`. */
  desactivar: async (id: number) => CatalogoService.desactivarProducto(id),
};

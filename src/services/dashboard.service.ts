// src/services/dashboard.service.ts
import { api, type ApiSuccess, type Paginated } from './api';
import type { Venta } from './ventas.service';
import { rangoAyer, rangoHoy, rangoMesEnCurso } from '../lib/rango-fechas';

/**
 * Métricas del dashboard.
 *
 * ## Historial de bugs de este archivo (los dos ya corregidos)
 *
 * 1. **Siempre mostraba 0.** Leía `v.createdAt`, pero el backend devuelve
 *    `created_at`… y `ventas` **no tiene esa columna**: su eje temporal es
 *    `fecha_hora`. El filtro de "ventas de hoy" nunca encontraba nada.
 *
 * 2. **El día estaba desplazado.** Construía el rango como `${d}T00:00:00` sin
 *    zona horaria, y Postgres lo interpreta en **UTC** (la zona del servidor).
 *    Una venta de las 20:00 en Bogotá se guarda como las 01:00Z del día
 *    siguiente y quedaba fuera del filtro. El mismo bug que tenía el portal del
 *    colaborador; ahora los dos usan `lib/rango-fechas`, que sí calcula la
 *    medianoche **de la zona del negocio** en UTC.
 *
 * ## Por qué hay dos "pendientes" distintos
 *
 * Son cosas diferentes y mezclarlas confunde:
 *
 *   · **Comandas pendientes** → el colaborador ya hizo el servicio y **recepción
 *     todavía no lo ha cobrado**. Es dinero que está en el salón, y es lo que el
 *     cajero tiene que resolver. **Es lo accionable.**
 *   · **Ventas PENDIENTE** → ventas ya registradas que quedaron a crédito (fiado).
 *     Es dinero que el cliente debe.
 *
 * El KPI principal muestra las **comandas**, porque son las que se pueden cobrar
 * ahora mismo.
 *
 * TODO: cuando exista `GET /reportes/dashboard`, sustituir estos cálculos por una
 * sola llamada agregada en el servidor.
 */

export interface DashboardMetrics {
  /** Total facturado hoy (sólo ventas PAGADA). */
  ventasDia: number;
  ordenesHoy: number;
  ticketPromedio: number;
  /**
   * **Servicios ya realizados que aún no se han cobrado.** El colaborador los
   * registró y están en estado `pendiente` esperando a recepción o caja.
   */
  comandasPendientes: number;
  /** Cuentas por cobrar con saldo (créditos que el cliente aún debe). */
  ventasPendientes: number;
  clientesActivos: number;
  colaboradoresActivos: number;
  /**
   * Facturado **en lo que va de mes**. Es lo que se compara con
   * `metas.ingresosMes`.
   */
  ventasMes: number;
  /**
   * Facturado **ayer**. Existe sólo para poder decir «hoy vas +12 % que ayer»:
   * una cifra sin referencia no dice si el negocio va bien o mal.
   */
  ventasAyer: number;
}

export const DashboardService = {
  getMetrics: async (): Promise<DashboardMetrics> => {
    // Rango de HOY en la zona del negocio, como instantes UTC.
    const { desde, hasta } = rangoHoy();
    const ayer = rangoAyer();
    const mes = rangoMesEnCurso();

    const [ventasHoy, ventasDeAyer, ventasDelMes, pendientes, comandas, clientes, colaboradores] =
      await Promise.all([
        api.get<unknown, Paginated<Venta>>(
          `/ventas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}` +
            `&estado=PAGADA&limit=100&sort=-fecha_hora`,
        ),
        api.get<unknown, Paginated<Venta>>(
          `/ventas?desde=${encodeURIComponent(ayer.desde)}&hasta=${encodeURIComponent(ayer.hasta)}` +
            `&estado=PAGADA&limit=100`,
        ),
        // `limit=100` y se suma sólo lo visible: suficiente para una meta mensual
        // mientras el volumen sea bajo. Con cientos de ventas al mes esto hay que
        // moverlo al servidor (ver el TODO de arriba).
        api.get<unknown, Paginated<Venta>>(
          `/ventas?desde=${encodeURIComponent(mes.desde)}&hasta=${encodeURIComponent(mes.hasta)}` +
            `&estado=PAGADA&limit=100`,
        ),
        // Créditos: se cuentan las CUENTAS POR COBRAR con saldo, no las ventas en
        // estado PENDIENTE (una venta de prueba sin cuenta disparaba el aviso y en
        // Cuentas no aparecía nada).
        Promise.all(
          ['PENDIENTE', 'PARCIAL', 'VENCIDA'].map((e) =>
            api.get<unknown, Paginated<{ id: number }>>(`/cuentas-cobrar?estado=${e}&limit=1`),
          ),
        ),
        // `contarPendientes` devuelve `{ pendientes: n }` y **no** lleva filtro de
        // fecha: cuenta todo lo que sigue sin cobrar, aunque sea de días anteriores.
        // Es lo correcto: una comanda de ayer sin cobrar sigue siendo dinero sin
        // entrar, y esconderla sería justo lo contrario de lo que hace falta.
        //
        // ⚠️ **Trampa que me costó un bug:** el interceptor de `api.ts` devuelve
        // `response.data`, o sea **el sobre entero** (`{success, statusCode, data,
        // meta?, timestamp}`), NO el campo `data` de dentro.
        //
        // Los endpoints paginados funcionan con `res.data` porque el
        // `TransformResponseInterceptor` **eleva** el payload al sobre: allí `data`
        // es el array y `meta` es hermano suyo (`Paginated<T> = ApiSuccess<T[]> & {meta}`).
        // En un endpoint NO paginado como éste, `data` es el objeto del payload, así
        // que hay que leer `res.data.pendientes` y tiparlo como `ApiSuccess<…>`.
        api.get<unknown, ApiSuccess<{ pendientes: number }>>('/comandas/pendientes/count'),
        api.get<unknown, Paginated<{ id: number }>>('/catalogo/clientes?limit=1'),
        api.get<unknown, Paginated<{ id: number; activo: boolean }>>(
          '/colaboradores?limit=1&activo=true',
        ),
      ]);

    const sumar = (filas: Venta[]) => filas.reduce((acc, v) => acc + Number(v.total ?? 0), 0);
    const filas = ventasHoy.data ?? [];
    const ventasDia = sumar(filas);
    const ordenesHoy = filas.length;

    return {
      ventasDia,
      ordenesHoy,
      ticketPromedio: ordenesHoy > 0 ? ventasDia / ordenesHoy : 0,
      comandasPendientes: comandas.data?.pendientes ?? 0,
      ventasPendientes: pendientes.reduce((acc, r) => acc + (r.meta?.total ?? 0), 0),
      clientesActivos: clientes.meta?.total ?? 0,
      colaboradoresActivos: colaboradores.meta?.total ?? 0,
      ventasMes: sumar(ventasDelMes.data ?? []),
      ventasAyer: sumar(ventasDeAyer.data ?? []),
    };
  },
};

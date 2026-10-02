// src/hooks/useComandas.ts
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  ComandasService,
  comandasKeys,
  type Comanda,
  type ListarComandasFiltros,
} from '../services/comandas.service';
import { aISODate } from '../lib/format';
import { rangoHoy, rangoSemanaEnCurso } from '../lib/rango-fechas';
import type { ItemCatalogo } from '../services/catalog.service';

/**
 * Hooks de TanStack Query del módulo de comandas.
 *
 * Viven en un archivo propio y no en las páginas porque el portal comparte
 * consultas entre pantallas (el shell pide la semana, `/app` pide el día,
 * `/app/comisiones` vuelve a pedir la semana): así la clave de caché se escribe
 * una sola vez y no hay riesgo de que dos pantallas usen claves distintas para lo
 * mismo.
 *
 * ⚠️ **Ninguna consulta manda `colaborador_id`.** Para el rol `colaborador` el
 * backend fuerza el suyo en el servidor: mandarlo sería ruido y, en el peor caso,
 * daría la falsa impresión de que el cliente controla el alcance.
 *
 * ⚠️ **Límite de `limit`:** el `PaginationQueryDto` del backend valida `@Max(100)`.
 * Un `limit` mayor responde `400 VALIDATION_ERROR`, no una lista más larga.
 */
export const LIMITE_MAX_COMANDAS = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Rangos de fecha
//
// Viven en `lib/rango-fechas.ts` (lógica pura, sin React) para poder probarlos
// con `node scripts/verificar-fechas.mjs`. Se reexportan aquí para no romper a
// quien ya los importaba desde este archivo.
//
// ⚠️ **Hubo un bug real aquí**: el rango se construía como `…T00:00:00` sin zona
// horaria, y Postgres lo interpretaba en UTC (la zona del servidor). Un servicio
// de las 20:03 en Bogotá se guarda como `…T01:03Z` — el día siguiente en UTC — y
// **desaparecía del filtro de «hoy»**. El detalle completo está en el módulo.
// ─────────────────────────────────────────────────────────────────────────────

export type { RangoFechas } from '../lib/rango-fechas';
// `export … from` NO trae los nombres al ámbito de este módulo, así que hay que
// importarlos además de reexportarlos: abajo se usan en los hooks.
export {
  rangoHoy,
  rangoSemanaEnCurso,
  rangoMesEnCurso,
  rangoPersonalizado,
} from '../lib/rango-fechas';

// ─────────────────────────────────────────────────────────────────────────────
// Comisión estimada — espejo de la precedencia de la RPC `confirmar_comanda`
//
// El backend NO devuelve la comisión de una comanda sin cobrar: la persiste al
// confirmar (`006_comandas_rpc.sql:498-531`). Para que el colaborador vea una
// cifra antes de enviar, se replica aquí esa misma precedencia:
//
//   porcentaje: línea > servicio > colaborador > ninguno
//   base:       precio × cantidad  (+ extras comisionables)
//               − costo_insumo si `comision_sobre = 'precio_menos_insumo'`
//
// Es una **estimación**: los definitivos los calcula la base al cobrar. La UI
// tiene que decirlo con todas las letras.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Porcentaje que la base usaría para un servicio del catálogo.
 *
 * ⚠️ `GET /catalogo/items` no incluye el `porcentaje_comision` del colaborador
 * (el de la tabla `colaboradores`), que es el último de la precedencia. Si el
 * servicio no trae `porcentaje_colaborador`, la estimación sale `null` y la UI
 * muestra "se calcula al cobrar" en lugar de un `$0.00` engañoso.
 */
export function porcentajeServicioCatalogo(item: ItemCatalogo | undefined): number | null {
  if (!item) return null;
  const directo = item.porcentaje_colaborador;
  if (typeof directo === 'number') return directo;
  const propio = item.porcentaje_comision;
  if (typeof propio === 'number') return propio;
  return null;
}

export interface ComisionEstimada {
  /** Comisión estimada, o `null` si no se conoce el porcentaje aplicable. */
  monto: number | null;
  /** Base sobre la que se aplicaría el porcentaje. */
  base: number;
  /** Porcentaje aplicado, si se conoce. */
  porcentaje: number | null;
  /** `false` cuando la base no comisiona nada (ningún extra comisionable ni servicio). */
  comisiona: boolean;
}

/**
 * Estimación de la comisión de **una línea** (un servicio + sus extras), con la
 * misma fórmula que la RPC.
 *
 * @param extras Extras **marcados** con su precio, no los del catálogo completo.
 */
export function estimarComisionLinea(
  servicio: ItemCatalogo | undefined,
  cantidad: number,
  extras: ReadonlyArray<{ monto_unitario: number; cantidad: number; comisionable: boolean }>,
): ComisionEstimada {
  const precio = Number(servicio?.precio ?? 0);
  let base = precio * cantidad;

  const comisionSobre: string | null | undefined = servicio?.comision_sobre;
  const costoInsumo = Number(servicio?.costo_insumo ?? 0);
  if (comisionSobre === 'precio_menos_insumo' && costoInsumo > 0) {
    base = Math.max(0, base - costoInsumo * cantidad);
  }

  const extrasComisionables = extras.reduce(
    (acc, e) => acc + (e.comisionable ? e.monto_unitario * e.cantidad : 0),
    0,
  );
  base += extrasComisionables;

  const porcentaje = porcentajeServicioCatalogo(servicio);
  if (porcentaje === null) {
    return { monto: null, base, porcentaje: null, comisiona: base > 0 };
  }
  const comision = Math.round(base * (porcentaje / 100) * 100) / 100;
  return { monto: comision, base, porcentaje, comisiona: true };
}

/** Suma las comisiones estimadas de varias líneas. */
export function sumarComisionesEstimadas(estimaciones: ComisionEstimada[]): ComisionEstimada {
  const algunaDesconocida = estimaciones.some((e) => e.monto === null);
  const base = estimaciones.reduce((acc, e) => acc + e.base, 0);
  if (algunaDesconocida) {
    return { monto: null, base, porcentaje: null, comisiona: base > 0 };
  }
  const monto = estimaciones.reduce((acc, e) => acc + (e.monto ?? 0), 0);
  return { monto: Math.round(monto * 100) / 100, base, porcentaje: null, comisiona: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────────────────────────────────────

export type FiltrosListaComandas = Omit<ListarComandasFiltros, 'page' | 'limit'>;

/** Listado genérico de comandas (historial, rango personalizado, etc.). */
export function useMisComandas(
  filtros: FiltrosListaComandas,
  opciones: { enabled?: boolean; limit?: number } = {},
) {
  const limit = Math.min(opciones.limit ?? 50, LIMITE_MAX_COMANDAS);
  const completo: ListarComandasFiltros = { ...filtros, page: 1, limit };

  return useQuery({
    queryKey: comandasKeys.lista(completo),
    queryFn: () => ComandasService.listar(completo),
    enabled: opciones.enabled ?? true,
    // Al cambiar de filtro se conserva la lista anterior mientras llega la nueva:
    // evita el parpadeo de "no hay servicios" al pulsar «Esta semana».
    placeholderData: (previo) => previo,
  });
}

/** Los servicios de hoy del colaborador. */
export function useComandasDeHoy(opciones: { enabled?: boolean } = {}) {
  return useMisComandas({ ...rangoHoy() }, { enabled: opciones.enabled, limit: 50 });
}

/** Los servicios de la semana en curso (lo que pide el shell y `/app/comisiones`). */
export function useComandasDeLaSemana(opciones: { enabled?: boolean } = {}) {
  return useMisComandas({ ...rangoSemanaEnCurso() }, { enabled: opciones.enabled, limit: 100 });
}

/** Contador de pendientes de cobro del colaborador. */
export function usePendientesCount(opciones: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: comandasKeys.conteoPendientes(),
    queryFn: ComandasService.contarPendientes,
    enabled: opciones.enabled ?? true,
  });
}

/** Detalle de una comanda (con líneas y extras). */
export function useComanda(id: number | null) {
  return useQuery({
    queryKey: comandasKeys.detalle(id ?? 0),
    queryFn: () => ComandasService.obtener(id as number),
    enabled: id !== null,
  });
}

/**
 * Detalles de **varias** comandas a la vez.
 *
 * ⚠️ **Por qué existe esto:** `GET /comandas` hace `select('*')` sin traer las
 * líneas, así que una fila del listado no sabe **qué servicio** se hizo: sólo
 * tiene folio, cliente, fecha e importes. Para pintar "Masaje relajante 60'" en la
 * tarjeta hay que pedir el detalle de cada una. Son N peticiones pequeñas contra
 * una caché estable (el detalle de una comanda ya no cambia una vez cobrada),
 * acotadas por el `limit` de la lista. Es el precio de no tocar el backend.
 *
 * Devuelve un `Map<id, Comanda>` para resolver cada fila en O(1) al pintar.
 */
export function useDetallesDeComandas(ids: number[]) {
  // La clave del array debe ser estable por contenido: un array nuevo con los
  // mismos ids en cada render dispararía el efecto de `useQueries` sin motivo.
  const idsOrdenados = [...new Set(ids)].sort((a, b) => a - b);

  const resultados = useQueries({
    queries: idsOrdenados.map((id) => ({
      queryKey: comandasKeys.detalle(id),
      queryFn: () => ComandasService.obtener(id),
      staleTime: 5 * 60_000,
    })),
  });

  const detalles = new Map<number, Comanda>();
  let cargando = false;
  let primerError: unknown = null;

  resultados.forEach((r, i) => {
    const id = idsOrdenados[i];
    if (r.data) detalles.set(id, r.data);
    if (r.isLoading) cargando = true;
    if (r.error && !primerError) primerError = r.error;
  });

  return { detalles, cargando, error: primerError };
}

/** Todos los servicios de un día agrupados, listos para pintar. */
export function agruparPorDia(comandas: Comanda[]): Array<{ dia: string; filas: Comanda[] }> {
  const grupos = new Map<string, Comanda[]>();
  for (const c of comandas) {
    const clave = aISODate(new Date(c.fecha_servicio));
    const lista = grupos.get(clave);
    if (lista) lista.push(c);
    else grupos.set(clave, [c]);
  }
  return [...grupos.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dia, filas]) => ({
      dia,
      filas: filas.sort((a, b) => (a.fecha_servicio < b.fecha_servicio ? 1 : -1)),
    }));
}

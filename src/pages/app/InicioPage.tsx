// src/pages/app/InicioPage.tsx
//
// `/app` — la pantalla que el colaborador abre al terminar un servicio (spec §3.18).
//
// Prioridad absoluta: **registrar en menos de 30 segundos**. Por eso hay una sola
// acción protagonista (el CTA con gradiente) y, encima, la **tarjeta hero** con lo
// que lleva ganado hoy y cómo va contra su meta del día.
//
// ## Lo que cambió y por qué
// 1. Los dos recuadros («Hoy has registrado» / «Cobrado hoy») se fundieron en la
//    tarjeta hero: separados obligaban a sumar de cabeza y no decían nada del
//    objetivo del día.
// 2. **Se eliminó el N+1 de `useDetallesDeComandas`.** El listado
//    `GET /comandas` ya trae `items[]` (con `servicio_nombre` resuelto) y
//    `comision_total` — comprobado contra la API en marcha. Antes esta pantalla
//    pedía el detalle de cada comanda una por una sólo para poder pintar el
//    nombre del servicio; ahora no hace falta ninguna petición extra.
// 3. Se añadieron «Repetir último» y los chips de «Más usados», que abren el
//    asistente con el servicio ya elegido.
//
// ## La regla que no se rompe: nunca un `0` que no es un dato
// Mientras carga: esqueleto. Si falló: `—`. Un `$0` o un «0 servicios» con la red
// caída es indistinguible de «hoy no he hecho nada», y con eso el colaborador
// toma decisiones malas (deja de registrar, o cree que no le pagaron).
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronRight, Plus, ReceiptText } from 'lucide-react';

import { CatalogoService, type ItemCatalogo, type Servicio } from '../../services/catalog.service';
import type { Comanda, ComandaItem } from '../../services/comandas.service';
import { useAuthStore } from '../../stores/auth.store';
import {
  estimarComisionLinea,
  sumarComisionesEstimadas,
  useComandasDeHoy,
  useMisComandas,
  usePendientesCount,
  type ComisionEstimada,
} from '../../hooks/useComandas';
import { formatNumero } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { AvisoApi } from '../../components/portal/AvisoApi';
import { ComandaCard } from '../../components/portal/ComandaCard';
import { TarjetaGanadoHoy } from '../../components/portal/TarjetaGanadoHoy';
import { RepetirUltimo } from '../../components/portal/RepetirUltimo';
import { ChipsMasUsados } from '../../components/portal/ChipsMasUsados';
import { useMetaDelDia } from '../../components/portal/metas';

/**
 * ⚠️ El **tipo** compartido de comandas (`src/services/comandas.service.ts`, que
 * este encargo no toca) todavía describe el listado como si no trajera líneas y no
 * conoce `comision_total`. La **API real sí los devuelve**, así que se declaran
 * aquí, sin `any` y sin duplicar el modelo de datos: son la fila del listado más
 * los dos campos calculados que el backend añade (`adjuntarLineas`).
 */
type ItemDelListado = ComandaItem & { servicio_nombre?: string | null };
type ComandaDelListado = Comanda & {
  comision_total?: number | null;
  items?: ItemDelListado[];
};

/** «Ensancha» una fila del listado a lo que la API devuelve de verdad. */
function comoListado(c: Comanda): ComandaDelListado {
  return c;
}

/** `GET /catalogo/servicios` no expone `duracion_minutos` en el tipo compartido. */
type ServicioConDuracion = Servicio & { duracion_minutos?: number | null };

/**
 * Comisión de una comanda **ya cobrada**: la que persistió la base al confirmar.
 *
 * `comision_total` es la suma que calcula el backend; si algún día no viniera (es
 * un campo añadido por `adjuntarLineas`, no una columna), se suma desde las
 * líneas, que es exactamente la misma cuenta. Así el resumen nunca dice `$0` por
 * un campo que falta.
 */
function comisionConfirmada(c: ComandaDelListado): number {
  if (c.comision_total !== null && c.comision_total !== undefined) {
    return Number(c.comision_total);
  }
  return (c.items ?? []).reduce((acc, i) => acc + Number(i.comision_monto ?? 0), 0);
}

/**
 * Comisión de **una línea todavía sin cobrar**.
 *
 * ⚠️ Aquí está la trampa: `comision_total` de una comanda `pendiente` vale `0`,
 * no una estimación — el backend sólo persiste `comision_monto` al confirmar el
 * cobro. Sumar `comision_total` haría que «por confirmar» dijera `~$0` para
 * siempre, justo mientras hay trabajo sin cobrar. Se estima con la misma
 * precedencia que la RPC (`estimarComisionLinea`), que existe precisamente para
 * esto; si una línea ya trae comisión persistida, manda ésa.
 */
function comisionPendiente(
  item: ItemDelListado,
  servicios: Map<number, ItemCatalogo>,
): ComisionEstimada {
  if (item.comision_monto !== null && item.comision_monto !== undefined) {
    return {
      monto: Number(item.comision_monto),
      base: Number(item.base_comision ?? 0),
      porcentaje: null,
      comisiona: true,
    };
  }
  return estimarComisionLinea(servicios.get(item.servicio_id), Number(item.cantidad ?? 1), []);
}

export function InicioPage() {
  const user = useAuthStore((s) => s.user);
  const mio = user?.colaborador_id ?? null;

  const hoy = useComandasDeHoy();
  const pendientes = usePendientesCount();
  /** Historial reciente: alimenta «repetir último» y los chips de «más usados». */
  const historial = useMisComandas({}, { limit: 100 });

  // El catálogo se usa sólo para **estimar** la comisión de lo pendiente de
  // cobro. Para los nombres de servicio NO: el listado ya trae `servicio_nombre`.
  const catalogo = useQuery({
    queryKey: ['catalogo', 'items', true],
    queryFn: () => CatalogoService.listarItems(true),
    staleTime: 5 * 60_000,
  });
  const catalogoPorId = new Map((catalogo.data ?? []).map((i) => [i.id, i]));

  const { meta, cargando: metaCargando, error: metaError, puedeDefinir } = useMetaDelDia();

  // ── Hoy ───────────────────────────────────────────────────────────────────
  const filas = (hoy.data?.data ?? []).map(comoListado);
  const cobradas = filas.filter((c) => c.estado === 'confirmada');
  const pendientesHoy = filas.filter((c) => c.estado === 'pendiente');
  const confirmado = cobradas.reduce((acc, c) => acc + comisionConfirmada(c), 0);

  let porConfirmarMonto = 0;
  let porConfirmarParcial = false;
  for (const c of pendientesHoy) {
    const estimacion = sumarComisionesEstimadas(
      (c.items ?? []).map((i) => comisionPendiente(i, catalogoPorId)),
    );
    if (estimacion.monto === null) porConfirmarParcial = true;
    else porConfirmarMonto += estimacion.monto;
  }

  const hayPendientes = pendientesHoy.length > 0;
  // Si falta el catálogo para estimar, se enseña esqueleto y **no** un `~$0`.
  const porConfirmarCargando = hoy.isPending || (hayPendientes && catalogo.isPending);
  const porConfirmar: {
    monto: number | null;
    hay: boolean;
    parcial: boolean;
    cargando: boolean;
    error: boolean;
  } = {
    // Nada estimado y algo sin porcentaje = no hay cifra: `—`, no `~$0`.
    monto: porConfirmarParcial && porConfirmarMonto === 0 ? null : porConfirmarMonto,
    hay: hayPendientes,
    parcial: porConfirmarParcial,
    cargando: porConfirmarCargando,
    error: Boolean(catalogo.error) && hayPendientes,
  };

  // El contador de pendientes no filtra por fecha: pendientes totales menos los de
  // hoy = lo que quedó sin cobrar de días anteriores. Eso sí merece un aviso,
  // porque no se ve en la lista de hoy.
  const pendientesAntiguos = pendientes.isError
    ? 0
    : Math.max((pendientes.data?.pendientes ?? 0) - pendientesHoy.length, 0);

  // ── Atajos: repetir último y más usados ───────────────────────────────────
  const historialFilas = (historial.data?.data ?? []).map(comoListado);

  /** Una comanda puede tener líneas de otro colaborador: sólo cuentan las mías. */
  const lineasMias = (c: ComandaDelListado): ItemDelListado[] =>
    (c.items ?? []).filter((i) => i.colaborador_id === null || i.colaborador_id === mio);

  const nombreDeLinea = (i: ItemDelListado): string =>
    i.servicio_nombre ?? catalogoPorId.get(i.servicio_id)?.nombre ?? `Servicio #${i.servicio_id}`;

  // El listado llega ordenado por `-fecha_servicio`: la primera comanda con líneas
  // mías es «el último servicio».
  const ultima = historialFilas.find((c) => lineasMias(c).length > 0) ?? null;
  const lineaUltima = ultima ? lineasMias(ultima)[0] : null;

  // ⚠️ `limit: 200` **no** vale: `PaginationQueryDto` valida `@Max(100)` y responde
  // `400 VALIDATION_ERROR`. Comprobado contra la API en marcha.
  const catalogoServicios = useQuery({
    queryKey: ['catalogo', 'servicios', true],
    queryFn: () => CatalogoService.listarServicios({ activo: true, limit: 100 }),
    staleTime: 5 * 60_000,
    // Sólo hace falta para la duración del «último»: sin historial, no se pide.
    enabled: lineaUltima !== null,
  });

  const detallePorServicio = new Map<number, ServicioConDuracion>();
  for (const s of catalogoServicios.data?.data ?? []) detallePorServicio.set(s.id, s);

  const catalogoUltimo = lineaUltima ? detallePorServicio.get(lineaUltima.servicio_id) : undefined;
  const ultimoServicio = lineaUltima
    ? {
        id: lineaUltima.servicio_id,
        nombre: nombreDeLinea(lineaUltima),
        // El precio de hoy (catálogo) es el que se cobraría al repetirlo; el de la
        // línea es el de aquel día y sólo sirve de respaldo.
        precio: Number(catalogoUltimo?.precio ?? lineaUltima.precio_unitario_estimado ?? 0),
        duracionMinutos: catalogoUltimo?.duracion_minutos ?? null,
      }
    : null;

  const conteo = new Map<number, { nombre: string; veces: number }>();
  for (const c of historialFilas) {
    for (const i of lineasMias(c)) {
      const actual = conteo.get(i.servicio_id);
      if (actual) actual.veces += 1;
      else conteo.set(i.servicio_id, { nombre: nombreDeLinea(i), veces: 1 });
    }
  }
  const masUsados = [...conteo.entries()]
    .sort((a, b) => b[1].veces - a[1].veces || a[0] - b[0])
    .slice(0, 3)
    .map(([id, v]) => ({ id, nombre: v.nombre, veces: v.veces }));

  // ── Nombres para las tarjetas ─────────────────────────────────────────────
  // Salen del propio listado, así que este mapa no cuesta ninguna petición.
  const nombres = new Map<number, string>();
  for (const c of filas) {
    for (const i of c.items ?? []) {
      if (i.servicio_nombre) nombres.set(i.servicio_id, i.servicio_nombre);
    }
  }

  const error = hoy.error;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Tu día"
        descripcion="Lo que llevas ganado hoy y lo que recepción todavía tiene que cobrar."
      />

      <TarjetaGanadoHoy
        ganado={hoy.isError ? null : confirmado}
        cargando={hoy.isPending}
        porConfirmar={porConfirmar}
        meta={meta}
        metaCargando={metaCargando}
        metaError={Boolean(metaError)}
        puedeDefinirMeta={puedeDefinir}
        serviciosConfirmados={cobradas.length}
      />

      {/* CTA protagonista: una sola acción por vista. */}
      <Link
        to="/app/nuevo"
        className="btn-primary flex min-h-20 w-full flex-col gap-1 text-lg"
        aria-label="Registrar un servicio que acabas de terminar"
      >
        <span className="flex items-center gap-2 font-bold">
          <Plus size={22} aria-hidden="true" />
          Registrar servicio
        </span>
        <span className="text-body-sm font-normal opacity-90">
          Elige el servicio, el cliente y envíalo
        </span>
      </Link>

      {error ? <AvisoApi error={error} /> : null}

      {/*
        Los atajos van bajo el CTA, no encima: el camino por defecto sigue siendo
        «Registrar servicio», y repetir es el atajo de quien ya sabe qué hizo.
        Mientras llega el historial se reserva el hueco, para que el contenido de
        abajo no dé un salto al aparecer.
      */}
      {historial.isPending ? (
        <div className="skeleton h-14 w-full" aria-hidden="true" />
      ) : (
        <RepetirUltimo servicio={ultimoServicio} />
      )}

      <ChipsMasUsados servicios={masUsados} />

      {pendientesAntiguos > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 text-body-sm text-text-secondary">
          <p className="flex min-w-0 items-start gap-2">
            <ReceiptText size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              Además, {formatNumero(pendientesAntiguos)} servicio
              {pendientesAntiguos === 1 ? '' : 's'} de días anteriores sigue
              {pendientesAntiguos === 1 ? '' : 'n'} sin cobrar.
            </span>
          </p>
          {/* Enlace con área táctil de 48 px, no un enlace incrustado en la frase. */}
          <Link
            to="/app/servicios"
            className="flex min-h-12 items-center gap-0.5 text-label text-accent-from"
          >
            Ver el historial
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Servicios de hoy */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-h2 text-text-primary">
            <CalendarCheck size={16} className="text-accent-from" aria-hidden="true" />
            Servicios de hoy
            {!hoy.isPending && !hoy.isError && filas.length > 0 && (
              <span className="text-body-sm font-normal text-text-muted">
                · {formatNumero(filas.length)}
              </span>
            )}
          </h2>
          <Link
            to="/app/servicios"
            className="flex min-h-12 items-center gap-0.5 text-label text-accent-from"
          >
            Ver historial
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {hoy.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only">Cargando los servicios de hoy…</span>
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
          </div>
        ) : filas.length === 0 ? (
          <div className="panel p-5 text-center">
            <p className="text-body font-semibold text-text-primary">
              Aún no has registrado servicios hoy
            </p>
            <p className="mt-1 text-body-sm text-text-secondary">
              Toca «Registrar servicio» cuando termines uno. Aparecerá aquí con su estado: por
              cobrar, cobrado o rechazado.
            </p>
            {historialFilas.length > 0 && (
              <p className="mt-2 text-body-sm text-text-muted">
                Si ya registraste algo y no lo ves, revisa el historial por si quedó en otro día.
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-3" aria-live="polite">
            {filas.map((c) => (
              <li key={c.id}>
                {/*
                  Se pasa la misma fila como `detalle`: el listado ya trae las
                  líneas, así que la tarjeta puede desplegar el detalle sin pedir
                  nada más (antes: una petición por comanda).
                */}
                <ComandaCard comanda={c} detalle={c} nombresServicios={nombres} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

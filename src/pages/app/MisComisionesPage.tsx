// src/pages/app/MisComisionesPage.tsx
//
// `/app/comisiones` — comisión devengada del periodo que el colaborador elija
// (día · semana · mes), su avance contra la meta **de ese periodo** y el historial
// de liquidaciones (spec §3.18). Todo es **sólo lectura**.
//
// ## Lo que cambió y por qué
// 1. Antes esta pantalla medía **sólo la semana en curso** y la meta que enseñaba
//    era la **del día**. Una meta semanal se guardaba y no aparecía en ningún
//    sitio del portal. Ahora hay un selector y cada periodo se mide contra su
//    propia meta (`elegirMetaDelPeriodo`): mezclarlos daría una barra al 3000 %.
// 2. **Se eliminó el N+1 de `useDetallesDeComandas`.** El listado
//    `GET /comandas` ya trae `items[]` y `comision_total`
//    (`comandas.service.ts:377-425`, `adjuntarLineas`), así que pedir el detalle
//    de cada comanda para sumar su comisión era una petición por fila para un dato
//    que ya venía en la respuesta.
// 3. Las comandas `pendiente` salen **aparte** de lo devengado, como estimación y
//    con su aviso: la comisión sólo se persiste al cobrar el total.
//
// ## ⚠️ No existe un endpoint de "mis comisiones"
// El backend no expone el total devengado del colaborador (el módulo de comandas
// sólo devuelve comandas, y `/colaboradores/liquidaciones` sólo las
// liquidaciones ya generadas). Por eso la comisión del periodo se suma en el
// cliente sobre las comandas **cobradas**: es el importe que la base persistió al
// confirmar, no una estimación.
//
// ## La regla que no se rompe: nunca un `0` que no es un dato
// Mientras carga: esqueleto. Si falló: `—`. Un `$0` con la red caída es
// indistinguible de «no he ganado nada en el periodo».
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CircleDollarSign,
  HandCoins,
  Hourglass,
  Info,
  Target,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';

import { LiquidacionesService } from '../../services/liquidaciones.service';
import { CatalogoService, type ItemCatalogo } from '../../services/catalog.service';
import type { Comanda, ComandaItem } from '../../services/comandas.service';
import {
  LIMITE_MAX_COMANDAS,
  estimarComisionLinea,
  rangoHoy,
  rangoMesEnCurso,
  rangoSemanaEnCurso,
  sumarComisionesEstimadas,
  useMisComandas,
  type ComisionEstimada,
  type RangoFechas,
} from '../../hooks/useComandas';
import { aISODate, formatNumero, formatMoney, formatPeriodo, round2 } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { AvisoApi } from '../../components/portal/AvisoApi';
import { FilaLiquidacion } from '../../components/portal/FilaLiquidacion';
import { AvanceMeta } from '../../components/portal/AvanceMeta';
import { SelectorPeriodo } from '../../components/portal/SelectorPeriodo';
import { useMetasDelColaborador } from '../../components/portal/metas';
import {
  elegirMetaDelPeriodo,
  esTipoMedible,
  etiquetaPeriodo,
  etiquetaTipo,
  periodosConMeta,
  tituloMetaDelPeriodo,
  type DatosDelPeriodo,
  type MetaPeriodo,
} from '../../components/portal/metaAvance';

/**
 * ⚠️ El **tipo** compartido de comandas (`src/services/comandas.service.ts`, que
 * este encargo no toca) describe el listado como si no trajera líneas y no conoce
 * `comision_total`. La **API real sí los devuelve** —comprobado leyendo
 * `adjuntarLineas` y contra el backend en marcha—, así que se declaran aquí, sin
 * `any` y sin duplicar el modelo de datos.
 */
type ItemDelListado = ComandaItem;
type ComandaDelListado = Comanda & {
  comision_total?: number | null;
  items?: ItemDelListado[];
};

/** «Ensancha» una fila del listado a lo que la API devuelve de verdad. */
function comoListado(c: Comanda): ComandaDelListado {
  return c;
}

/** El rango de fechas de cada periodo, con la zona del negocio (`rango-fechas`). */
function rangoDe(periodo: MetaPeriodo): RangoFechas {
  if (periodo === 'dia') return rangoHoy();
  if (periodo === 'semana') return rangoSemanaEnCurso();
  return rangoMesEnCurso();
}

/**
 * Comisión de una comanda **ya cobrada**: la que persistió la base al confirmar.
 *
 * `comision_total` lo calcula el backend al adjuntar las líneas; si algún día no
 * viniera (es un campo añadido, no una columna), se suma desde las líneas, que es
 * exactamente la misma cuenta. Así la cifra nunca sale `$0` por un campo ausente.
 */
function comisionConfirmada(c: ComandaDelListado): number {
  if (c.comision_total !== null && c.comision_total !== undefined) {
    return Number(c.comision_total);
  }
  return (c.items ?? []).reduce((acc, i) => acc + Number(i.comision_monto ?? 0), 0);
}

/**
 * Comisión estimada de **una línea todavía sin cobrar**.
 *
 * ⚠️ `comision_total` de una comanda `pendiente` vale `0`, no una estimación: la
 * base sólo persiste `comision_monto` al confirmar el cobro. Se replica la
 * precedencia de la RPC con `estimarComisionLinea` (el mismo cálculo que usa el
 * inicio del portal): si la línea ya trae comisión persistida, manda ésa.
 */
function comisionPendiente(
  item: ItemDelListado,
  catalogo: Map<number, ItemCatalogo>,
): ComisionEstimada {
  return estimarComisionLinea(catalogo.get(item.servicio_id), Number(item.cantidad ?? 1), []);
}

export function MisComisionesPage() {
  const [periodo, setPeriodo] = useState<MetaPeriodo>('semana');

  const rango = rangoDe(periodo);

  // Una sola consulta para los tres periodos: la clave de caché incluye el rango,
  // así que cambiar de pestaña no vuelve a pedir el que ya se trajo, y el periodo
  // de la semana comparte caché con el shell (`useComandasDeLaSemana`).
  const lista = useMisComandas(rango, { limit: LIMITE_MAX_COMANDAS });

  /*
    ⚠️ `useMisComandas` usa `placeholderData: (previo) => previo`, así que al
    cambiar de periodo `data` puede ser **la lista del periodo anterior** con
    `isPending === false`. Pintarla bajo el nombre del periodo nuevo enseñaría las
    cifras de la semana como si fueran las del mes. `isPlaceholderData` es
    justamente la señal de «esto todavía no es mío».
  */
  const cargandoPeriodo = lista.isPending || lista.isPlaceholderData;
  const errorPeriodo = lista.isError;

  const filas = cargandoPeriodo || errorPeriodo ? [] : (lista.data?.data ?? []).map(comoListado);
  const cobradas = filas.filter((c) => c.estado === 'confirmada');
  const pendientes = filas.filter((c) => c.estado === 'pendiente');

  const devengado = round2(cobradas.reduce((acc, c) => acc + comisionConfirmada(c), 0));
  const conComision = cobradas.filter((c) => comisionConfirmada(c) > 0).length;

  const datos: DatosDelPeriodo = {
    confirmado: devengado,
    serviciosConfirmados: cobradas.length,
  };

  /*
    El listado del backend está topeado a 100 filas (`PaginationQueryDto` valida
    `@Max(100)`), que es holgado para un día o una semana pero **no** para un mes
    con mucho movimiento. Si el servidor dice que hay más, la suma es un mínimo y
    hay que decirlo: un total truncado presentado como total es una cifra falsa.
  */
  const totalEnServidor = lista.data?.meta?.total ?? filas.length;
  const truncado = !cargandoPeriodo && !errorPeriodo && totalEnServidor > filas.length;

  // ── Estimado de lo pendiente de cobro ─────────────────────────────────────
  const hayPendientes = pendientes.length > 0;
  const catalogo = useQuery({
    queryKey: ['catalogo', 'items', true],
    queryFn: () => CatalogoService.listarItems(true),
    staleTime: 5 * 60_000,
    // Sin pendientes no hay nada que estimar: no se pide el catálogo.
    enabled: hayPendientes,
  });
  const catalogoPorId = new Map((catalogo.data ?? []).map((i) => [i.id, i]));

  let estimadoMonto = 0;
  let estimadoParcial = false;
  for (const c of pendientes) {
    const estimacion = sumarComisionesEstimadas(
      (c.items ?? []).map((i) => comisionPendiente(i, catalogoPorId)),
    );
    if (estimacion.monto === null) estimadoParcial = true;
    else estimadoMonto += estimacion.monto;
  }
  const estimado = {
    cantidad: pendientes.length,
    // Nada estimado y algo sin porcentaje = no hay cifra: `—`, no `~$0`.
    monto: estimadoParcial && estimadoMonto === 0 ? null : estimadoMonto,
    parcial: estimadoParcial,
    cargando: cargandoPeriodo || (hayPendientes && catalogo.isPending),
    error: Boolean(catalogo.error) && hayPendientes,
  };

  // ── Meta del periodo elegido ──────────────────────────────────────────────
  const metas = useMetasDelColaborador();
  const hoyISO = aISODate(new Date());

  const meta = elegirMetaDelPeriodo(metas.data ?? [], metas.colaboradorId, hoyISO, periodo);
  const metasCargando = metas.colaboradorId !== null && metas.isPending;
  const metasError = metas.isError;

  // `null` mientras no se sabe: el selector no marca nada en vez de decir que no
  // hay meta donde todavía no se ha mirado.
  const conMeta =
    metasCargando || metasError
      ? null
      : periodosConMeta(metas.data ?? [], metas.colaboradorId, hoyISO);

  /** Enlace discreto a la pantalla de metas. Área táctil de 48 px. */
  const enlaceMetas = (texto: string, conIcono = false): ReactNode => (
    <Link
      to="/app/metas"
      className="inline-flex min-h-12 items-center gap-1.5 text-label text-accent-from"
    >
      {conIcono && <Target size={14} aria-hidden="true" />}
      {texto}
    </Link>
  );

  /*
    Sin meta, sin objetivo, meta de un tipo que no se puede medir o sin datos del
    periodo **no hay barra**: se explica en su lugar. Se decide aquí, en un solo
    punto, y no dentro del JSX.
  */
  let zonaMeta: ReactNode;
  if (metasCargando) {
    zonaMeta = (
      <div className="space-y-2" aria-hidden="true">
        <div className="skeleton h-2 w-full" />
        <div className="skeleton h-4 w-40" />
      </div>
    );
  } else if (metasError) {
    zonaMeta = (
      <>
        <p className="text-body-sm text-text-muted">No pudimos leer tus metas.</p>
        {enlaceMetas('Ver mis metas')}
      </>
    );
  } else if (meta === null) {
    // Sin meta de este periodo NO se pinta barra: contra cero daría un 100 %
    // falso, que es peor que no enseñar nada.
    zonaMeta = metas.colaboradorId === null ? null : enlaceMetas('Definir mi meta', true);
  } else if (!esTipoMedible(meta.tipo)) {
    zonaMeta = (
      <>
        <p className="text-body-sm text-text-muted">
          Tu {tituloMetaDelPeriodo(periodo).toLowerCase()} es de otro tipo (
          {etiquetaTipo(meta.tipo)}) y esta pantalla no la mide.
        </p>
        {enlaceMetas('Ver mis metas')}
      </>
    );
  } else if (cargandoPeriodo) {
    zonaMeta = (
      <div className="space-y-2" aria-hidden="true">
        <div className="skeleton h-2 w-full" />
        <div className="skeleton h-4 w-40" />
      </div>
    );
  } else if (errorPeriodo) {
    zonaMeta = (
      <>
        <p className="text-body-sm text-text-muted">
          No pudimos calcular tu avance de este periodo.
        </p>
        {enlaceMetas('Ver mis metas')}
      </>
    );
  } else {
    zonaMeta = <AvanceMeta meta={meta} datos={datos} periodo={periodo} />;
  }

  // ── Historial de liquidaciones ────────────────────────────────────────────
  const liquidaciones = useQuery({
    queryKey: ['liquidaciones', 'portal', 'historial'],
    queryFn: () => LiquidacionesService.listar({ limit: 20 }),
  });

  const historial = liquidaciones.data?.data ?? [];

  /** Esqueleto de un importe o `—` si la lectura falló. Nunca un `0` falso. */
  const importe = (valor: number): ReactNode =>
    cargandoPeriodo ? (
      <span className="skeleton inline-block h-7 w-28 align-middle" aria-hidden="true" />
    ) : errorPeriodo ? (
      '—'
    ) : (
      formatMoney(valor)
    );

  const conteo = (valor: number): ReactNode =>
    cargandoPeriodo ? (
      <span className="skeleton inline-block h-4 w-8 align-middle" aria-hidden="true" />
    ) : errorPeriodo ? (
      '—'
    ) : (
      formatNumero(valor)
    );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Mis comisiones"
        descripcion="Elige el periodo: cuánto llevas devengado, cómo vas contra tu meta de ese periodo y lo que ya te han pagado."
      />

      {/* Periodo medido y su meta */}
      <section className="panel p-4">
        <h2 className="flex items-center gap-2 text-label uppercase tracking-wide text-text-muted">
          <TrendingUp size={12} aria-hidden="true" />
          {etiquetaPeriodo(periodo)} · {formatPeriodo(rango.desde, rango.hasta)}
        </h2>

        <div className="mt-3">
          <SelectorPeriodo valor={periodo} onCambiar={setPeriodo} conMeta={conMeta} />
        </div>

        {lista.error ? <AvisoApi error={lista.error} className="mt-3" /> : null}

        <dl className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-body text-text-secondary">Servicios cobrados</dt>
            <dd className="tabular text-body font-semibold text-text-primary">
              {conteo(cobradas.length)}
            </dd>
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-border-subtle pt-3">
            <dt className="text-body text-text-secondary">Comisión devengada</dt>
            <dd className="tabular text-h1 text-accent-from">{importe(devengado)}</dd>
          </div>
        </dl>

        {/*
          Lo pendiente de cobro va **fuera** de la cifra devengada: la comisión
          sólo se genera al cobrar el total, así que sumarlo sería contar dinero
          que todavía no existe. Se enseña como estimación y se dice que lo es.
        */}
        <div className="mt-3 border-t border-border-subtle pt-3" aria-live="polite">
          {estimado.cargando ? (
            <span className="skeleton inline-block h-4 w-48 align-middle" aria-hidden="true" />
          ) : errorPeriodo ? (
            <p className="text-body-sm text-text-muted">
              Por confirmar: <span className="font-semibold">—</span> · no pudimos leerlo.
            </p>
          ) : estimado.cantidad === 0 ? (
            <p className="text-body-sm text-text-muted">
              Nada por confirmar en este periodo: lo registrado ya está cobrado.
            </p>
          ) : estimado.error || estimado.monto === null ? (
            <p className="text-body-sm text-text-muted">
              Por confirmar: <span className="font-semibold">—</span> · no pudimos estimarlo. Se
              actualizará cuando recepción cobre.
            </p>
          ) : (
            <>
              <p className="text-body-sm text-text-secondary">
                Por confirmar (
                {formatNumero(estimado.cantidad)} servicio
                {estimado.cantidad === 1 ? '' : 's'}):{' '}
                <span className="tabular font-semibold text-text-primary">
                  ~{formatMoney(estimado.monto)}
                </span>
              </p>
              <p className="mt-0.5 flex items-start gap-1.5 text-label text-text-muted">
                <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Es un <strong>estimado</strong>: si caja aplica un descuento al cobrar, bajará
                  {estimado.parcial ? ' — y falta algún porcentaje, así que es un mínimo' : ''}.
                </span>
              </p>
            </>
          )}
        </div>

        {truncado && (
          <p className="mt-2 flex items-start gap-1.5 text-body-sm text-warning-text">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Este periodo tiene {formatNumero(totalEnServidor)} servicios y sólo se han leído los{' '}
              {formatNumero(filas.length)} más recientes: las cifras de arriba son un mínimo.
            </span>
          </p>
        )}

        {/* Avance contra la meta del periodo elegido */}
        <div className="mt-4 border-t border-border-subtle pt-3">{zonaMeta}</div>

        <p className="mt-3 flex items-start gap-1.5 text-body-sm text-text-muted">
          <Hourglass size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Se liquida al cerrar el periodo: administración genera la liquidación y el pago aparece
            en el historial de abajo. La cifra sale de la comisión que la base guardó al cobrar cada
            servicio
            {conComision > 0 ? ` (${formatNumero(conComision)} con comisión)` : ''}.
          </span>
        </p>
      </section>

      {/* Historial */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-h2 text-text-primary">
            <HandCoins size={16} className="text-accent-from" aria-hidden="true" />
            Historial de liquidaciones
          </h2>
          {historial.length > 0 && (
            <span className="text-body-sm text-text-muted">
              {liquidaciones.data?.meta?.total ?? historial.length} en total
            </span>
          )}
        </div>

        {liquidaciones.error ? <AvisoApi error={liquidaciones.error} /> : null}

        {liquidaciones.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only">Cargando tus liquidaciones…</span>
            <div className="skeleton h-20 w-full" />
            <div className="skeleton h-20 w-full" />
          </div>
        ) : historial.length === 0 ? (
          <div className="panel p-5 text-center">
            <CircleDollarSign size={20} className="mx-auto text-text-muted" aria-hidden="true" />
            <p className="mt-2 text-body font-semibold text-text-primary">
              Todavía no hay liquidaciones
            </p>
            <p className="mt-1 text-body-sm text-text-secondary">
              Cuando administración cierre y pague una semana, aparecerá aquí con su periodo, su
              importe y su estado.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {historial.map((l) => (
              <FilaLiquidacion key={l.id} liquidacion={l} />
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-1.5 text-body-sm text-text-muted">
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Si no estás de acuerdo con una liquidación, contacta con administración: el portal no
          permite modificarla.
        </span>
      </p>
    </div>
  );
}

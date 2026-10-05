// src/components/dashboard/SeccionMetas.tsx
//
// **El apartado de metas**: cuánto llevas frente a lo que te propusiste.
//
// ## Lo que hace útil esta sección
// No es la barra: es el **ritmo**. Un porcentaje suelto engaña — un 40 % el día
// 3 del mes es ir por delante y ese mismo 40 % el día 25 es ir muy por detrás.
// Por eso cada tarjeta compara el avance con lo esperado a estas alturas del
// periodo y, cuando falta dinero, dice **cuánto hace falta por día** (o por
// hora, en las metas diarias): eso es lo que convierte una barra en una decisión.
//
// ## `0` significa «sin meta definida»
// Las metas que valen `0` **no** se pintan con barra: se pintan con una tarjeta
// discreta que invita a definirlas. Una barra contra cero daría un `100 %` falso
// y el dueño creería haber cumplido un objetivo que nadie fijó.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  Gauge,
  Info,
  Settings,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';

import { useFormato } from '../../hooks/useFormato';
import { TZ, formatMoney, formatNumero } from '../../lib/format';
import type { DashboardMetrics } from '../../services/dashboard.service';
import { SinMetas } from './SinMetas';
import { TarjetaMeta, type TipoMeta } from './TarjetaMeta';
import { TarjetaMetaVacia } from './TarjetaMetaVacia';

// ─────────────────────────────────────────────────────────────────────────────
// Jornada del día
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Ventana de jornada del spa, en **hora del negocio**.
 *
 * Sale de `negocio.hora_apertura` / `negocio.hora_cierre`, que son **parámetros
 * configurables** y se editan en Ajustes como cualquier otra regla. Antes eran
 * dos constantes inventadas aquí dentro (9:00–19:00): el ritmo diario se medía
 * contra un horario que sólo existía en el código, así que un spa que abriera a
 * las 7 habría visto su ritmo mal calculado todos los días.
 *
 * Los valores por defecto se mantienen como red de seguridad: si el parámetro
 * falta o viene mal escrito, el panel **no** se queda sin ritmo — usa 9:00–19:00
 * y lo dice en el propio código.
 */
const MINUTOS_APERTURA_POR_DEFECTO = 9 * 60;
const MINUTOS_CIERRE_POR_DEFECTO = 19 * 60;

/**
 * `'09:30'` → 570 minutos desde medianoche, o `null` si no es una hora válida.
 *
 * Validar importa: el parámetro es texto libre, y un `'9'`, un `'25:00'` o un
 * `'nueve'` darían `NaN` y romperían el cálculo del ritmo **en silencio** (una
 * barra al 0 % o al 100 % sin motivo aparente).
 */
function minutosDeHHMM(hhmm: string | undefined | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Fallback si `meta.dias_laborables_mes` no está definido o es 0. */
const DIAS_LABORABLES_POR_DEFECTO = 26;

/** Fecha y hora actuales **en la zona del negocio**, descompuestas. */
function ahoraEnZona(zona: string): {
  anio: number;
  mes: number;
  dia: number;
  minutos: number;
} {
  // `Intl` con `timeZone` explícita. `new Date().toLocaleString()` daría la hora
  // del navegador, que puede no ser la del spa (y de noche discrepan de día).
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return {
    anio: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    minutos: valor('hour') * 60 + valor('minute'),
  };
}

interface Periodo {
  diasDelMes: number;
  /** Días de mes que quedan, **contando hoy** (a hoy todavía le quedan horas). */
  diasRestantes: number;
  /** Fracción del mes transcurrida según los días laborables configurados (0–1). */
  fraccionMes: number;
  /** Fracción de la jornada de hoy ya transcurrida (0–1). */
  fraccionDia: number;
  /** Horas de jornada que quedan hoy (`0` si ya cerró). */
  horasRestantesHoy: number;
}

function calcularPeriodo(
  zona: string,
  diasLaborables: number,
  minutosApertura: number,
  minutosCierre: number,
): Periodo {
  const { anio, mes, dia, minutos } = ahoraEnZona(zona);

  // El día 0 del mes siguiente es el último día de este mes.
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const laborables = diasLaborables > 0 ? diasLaborables : diasDelMes;

  // Si el cierre no es posterior a la apertura (mal configurado), se usa una
  // jornada de 10 h en lugar de dividir entre cero o por un negativo.
  const duracionJornada = Math.max(minutosCierre - minutosApertura, 1);
  const minutosTranscurridos = Math.min(Math.max(minutos - minutosApertura, 0), duracionJornada);

  return {
    diasDelMes,
    diasRestantes: Math.max(1, diasDelMes - dia + 1),
    // Si el mes ya pasó de los días laborables previstos, el objetivo se da por
    // «a punto de vencer» (100 %) en vez de exigir más del 100 % de la meta.
    fraccionMes: Math.min(dia / laborables, 1),
    fraccionDia: minutosTranscurridos / duracionJornada,
    horasRestantesHoy: (duracionJornada - minutosTranscurridos) / 60,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección
// ─────────────────────────────────────────────────────────────────────────────

/** Definición de una meta con todo lo que necesita su tarjeta. */
interface DefinicionMeta {
  clave: string;
  titulo: string;
  /** Texto de la tarjeta discreta cuando la meta está a `0`. */
  ayuda: string;
  icono: LucideIcon;
  meta: number;
  actual: number;
  tipo: TipoMeta;
  fraccionPeriodo: number | null;
  referencia: 'ritmo' | 'objetivo';
  contexto: ReactNode;
}

/** Valor destacado dentro de una línea de contexto. */
function Dato({ children }: { children: ReactNode }) {
  return <span className="tabular font-semibold text-text-secondary">{children}</span>;
}

export function SeccionMetas({
  metricas,
  cargando,
  hayError,
}: {
  metricas?: DashboardMetrics;
  /** `isPending` de las métricas: los valores de avance todavía no han llegado. */
  cargando: boolean;
  /**
   * Las métricas fallaron. Sin datos, todas valdrían `0` y las barras dirían
   * «muy por detrás del ritmo» cuando lo único que pasa es que no se pudo
   * consultar: pintar esa acusación falsa es peor que no pintar nada.
   */
  hayError: boolean;
}) {
  const { formato, cargando: cargandoFormato } = useFormato();
  const metas = formato?.metas;

  const metaIngresosMes = metas?.ingresosMes ?? 0;
  const metaIngresosDia = metas?.ingresosDia ?? 0;
  const metaServiciosDia = metas?.serviciosDia ?? 0;
  const metaTicket = metas?.ticketPromedio ?? 0;

  const diasLaborablesConfigurados = metas?.diasLaborablesMes ?? 0;
  const diasLaborables =
    diasLaborablesConfigurados > 0 ? diasLaborablesConfigurados : DIAS_LABORABLES_POR_DEFECTO;

  // El horario del negocio viene de parámetros configurables (Ajustes), con
  // 9:00–19:00 como red de seguridad si falta o está mal escrito.
  const minutosApertura =
    minutosDeHHMM(formato?.negocio?.horaApertura) ?? MINUTOS_APERTURA_POR_DEFECTO;
  const minutosCierre = minutosDeHHMM(formato?.negocio?.horaCierre) ?? MINUTOS_CIERRE_POR_DEFECTO;

  const periodo = calcularPeriodo(
    formato?.negocio?.zonaHoraria || TZ,
    diasLaborables,
    minutosApertura,
    minutosCierre,
  );

  const ventasMes = metricas?.ventasMes ?? 0;
  const ventasDia = metricas?.ventasDia ?? 0;
  const ordenesHoy = metricas?.ordenesHoy ?? 0;
  const ticketPromedio = metricas?.ticketPromedio ?? 0;

  // ── Ingresos del mes ──────────────────────────────────────────────────────
  const faltaMes = Math.max(metaIngresosMes - ventasMes, 0);
  const porDiaNecesario = periodo.diasRestantes > 0 ? faltaMes / periodo.diasRestantes : faltaMes;

  const contextoMes = (
    <>
      <p className="flex items-center gap-1.5">
        <CalendarClock size={12} className="shrink-0" aria-hidden="true" />
        {periodo.diasRestantes === 1
          ? 'Queda el día de hoy'
          : `Quedan ${formatNumero(periodo.diasRestantes)} días de mes`}
        {' · '}
        {formatNumero(periodo.diasDelMes - periodo.diasRestantes)} de{' '}
        {formatNumero(periodo.diasDelMes)} transcurridos
      </p>
      {faltaMes > 0 ? (
        <p>
          Necesitas <Dato>{formatMoney(porDiaNecesario)}</Dato> por día para llegar.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-success-text">
          <CheckCircle2 size={12} className="shrink-0" aria-hidden="true" />
          Objetivo del mes alcanzado.
        </p>
      )}
    </>
  );

  // ── Ingresos de hoy ───────────────────────────────────────────────────────
  const faltaDia = Math.max(metaIngresosDia - ventasDia, 0);
  const jornadaCerrada = periodo.horasRestantesHoy <= 0;
  const jornadaSinEmpezar = periodo.fraccionDia <= 0;

  const textoJornada = jornadaSinEmpezar
    ? 'La jornada de hoy todavía no ha empezado'
    : jornadaCerrada
      ? 'La jornada de hoy ya ha cerrado'
      : `Quedan ${formatNumero(Math.round(periodo.horasRestantesHoy))} h de jornada`;

  const contextoDia = (
    <>
      <p className="flex items-center gap-1.5">
        <Clock size={12} className="shrink-0" aria-hidden="true" />
        {textoJornada}
      </p>
      {faltaDia === 0 ? (
        <p className="flex items-center gap-1.5 text-success-text">
          <CheckCircle2 size={12} className="shrink-0" aria-hidden="true" />
          Objetivo del día alcanzado.
        </p>
      ) : jornadaCerrada ? (
        <p>
          Quedaron <Dato>{formatMoney(faltaDia)}</Dato> para el objetivo de hoy.
        </p>
      ) : periodo.horasRestantesHoy >= 1 ? (
        <p>
          Necesitas <Dato>{formatMoney(faltaDia / periodo.horasRestantesHoy)}</Dato> por hora para
          llegar.
        </p>
      ) : (
        <p>
          Queda menos de una hora de jornada y faltan <Dato>{formatMoney(faltaDia)}</Dato>.
        </p>
      )}
    </>
  );

  // ── Servicios de hoy (volumen, NO dinero) ─────────────────────────────────
  const faltaServicios = Math.max(metaServiciosDia - ordenesHoy, 0);

  const contextoServicios = (
    <>
      <p>
        {ordenesHoy === 1
          ? '1 servicio cobrado hoy'
          : `${formatNumero(ordenesHoy)} servicios cobrados hoy`}
      </p>
      {faltaServicios > 0 ? (
        <p>
          Faltan <Dato>{formatNumero(faltaServicios)}</Dato> para el objetivo del día.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-success-text">
          <CheckCircle2 size={12} className="shrink-0" aria-hidden="true" />
          Objetivo de servicios cumplido.
        </p>
      )}
    </>
  );

  // ── Ticket medio ──────────────────────────────────────────────────────────
  const diferenciaTicket = ticketPromedio - metaTicket;

  const contextoTicket = (
    <>
      <p>
        {ordenesHoy === 0
          ? 'Todavía no hay ventas cobradas hoy'
          : ordenesHoy === 1
            ? 'Sobre 1 venta cobrada hoy'
            : `Sobre ${formatNumero(ordenesHoy)} ventas cobradas hoy`}
      </p>
      {ordenesHoy === 0 ? (
        <p>El ticket medio se calcula con las ventas cobradas del día.</p>
      ) : diferenciaTicket >= 0 ? (
        <p>
          <Dato>{formatMoney(diferenciaTicket)}</Dato> por encima del objetivo.
        </p>
      ) : (
        <p>
          <Dato>{formatMoney(Math.abs(diferenciaTicket))}</Dato> por debajo del objetivo.
        </p>
      )}
    </>
  );

  const definiciones: DefinicionMeta[] = [
    {
      clave: 'ingresosMes',
      titulo: 'Ingresos del mes',
      ayuda: 'Cuánto quieres facturar este mes. Te dirá cuánto necesitas al día para lograrlo.',
      icono: CalendarDays,
      meta: metaIngresosMes,
      actual: ventasMes,
      tipo: 'moneda',
      fraccionPeriodo: periodo.fraccionMes,
      referencia: 'ritmo',
      contexto: contextoMes,
    },
    {
      clave: 'ingresosDia',
      titulo: 'Ingresos de hoy',
      ayuda: 'Cuánto quieres facturar en un día. El ritmo se mide contra las horas de jornada.',
      icono: DollarSign,
      meta: metaIngresosDia,
      actual: ventasDia,
      tipo: 'moneda',
      fraccionPeriodo: periodo.fraccionDia,
      referencia: 'ritmo',
      contexto: contextoDia,
    },
    {
      clave: 'serviciosDia',
      titulo: 'Servicios de hoy',
      ayuda: 'Cuántos servicios quieres cobrar al día. Es volumen, no dinero.',
      icono: Sparkles,
      meta: metaServiciosDia,
      actual: ordenesHoy,
      tipo: 'numero',
      fraccionPeriodo: periodo.fraccionDia,
      referencia: 'ritmo',
      contexto: contextoServicios,
    },
    {
      clave: 'ticketPromedio',
      titulo: 'Ticket medio',
      ayuda: 'Cuánto quieres que gaste de media cada cliente en una visita.',
      icono: Gauge,
      meta: metaTicket,
      actual: ticketPromedio,
      // El ticket medio es un promedio, no una suma: no «avanza» con las horas,
      // así que aquí el ritmo no aplica y se compara directo con el objetivo.
      fraccionPeriodo: null,
      referencia: 'objetivo',
      tipo: 'moneda',
      contexto: contextoTicket,
    },
  ];

  const definidas = definiciones.filter((d) => d.meta > 0);
  const sinDefinir = definiciones.filter((d) => d.meta <= 0);
  const cargandoTodo = cargando || cargandoFormato;

  return (
    <section aria-label="Metas" className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-h2 text-text-primary">
            <Target size={20} className="text-accent-from" aria-hidden="true" />
            Metas
          </h2>
          <p className="mt-1 max-w-3xl text-body-sm text-text-secondary">
            Cómo vas frente a tus metas, según el ritmo que necesitas a esta hora del periodo.
          </p>
        </div>
        {!cargandoTodo && (
          <Link to="/settings#metas" className="btn-ghost self-start text-label sm:self-auto">
            <Settings size={14} aria-hidden="true" />
            Ajustar metas
          </Link>
        )}
      </header>

      {cargandoTodo ? (
        // Mismo esqueleto que la tarjeta real (`cargando` sale antes de calcular
        // nada), para que no salte el layout al llegar los datos.
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {definiciones.map((d) => (
            <TarjetaMeta
              key={d.clave}
              titulo={d.titulo}
              icono={d.icono}
              actual={0}
              meta={0}
              tipo={d.tipo}
              fraccionPeriodo={null}
              cargando
            />
          ))}
        </div>
      ) : hayError ? (
        <div className="panel flex items-start gap-3 p-4" role="status">
          <Info size={16} className="mt-0.5 shrink-0 text-warning-text" aria-hidden="true" />
          <p className="text-body-sm text-text-secondary">
            No se pudo calcular el avance de las metas porque las métricas del panel no cargaron.
            Las metas definidas no se han perdido: pulsa «Actualizar» arriba para reintentarlo.
          </p>
        </div>
      ) : definidas.length === 0 ? (
        <SinMetas configuracionLeida={!!metas} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {definidas.map((m) => (
            <TarjetaMeta
              key={m.clave}
              titulo={m.titulo}
              icono={m.icono}
              actual={m.actual}
              meta={m.meta}
              tipo={m.tipo}
              fraccionPeriodo={m.fraccionPeriodo}
              referencia={m.referencia}
              contexto={m.contexto}
            />
          ))}

          {sinDefinir.map((m) => (
            <TarjetaMetaVacia key={m.clave} titulo={m.titulo} icono={m.icono} ayuda={m.ayuda} />
          ))}
        </div>
      )}
    </section>
  );
}

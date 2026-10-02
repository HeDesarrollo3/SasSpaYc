// src/components/portal/metaAvance.ts
//
// Lógica **pura** de las metas del colaborador (spec §5): qué meta manda en cada
// periodo —día, semana, mes— y cuánto llevas de ella.
//
// ## Por qué está separada y sin dependencias
// Igual que `lib/rango-fechas.ts`, este módulo no importa React, ni red, ni
// `import.meta.env`, así que **se puede ejecutar con Node** para comprobar la
// aritmética sin levantar el navegador:
//
// ```
// node --import ./scripts/registrar-ts.mjs <script-de-verificación>
// ```
//
// ## Por qué vive en `components/portal/` y no en `lib/`
// Porque el encargo de esta pantalla congela `src/lib/*`. La lógica no depende de
// React: sólo el sitio donde está es discutible.
//
// ## Las tres reglas que impone este módulo
// 1. **Sin objetivo (> 0) no hay barra**: un `100 %` contra cero sería un objetivo
//    cumplido que nadie fijó.
// 2. **El tope visual es 100 %** aunque se supere la meta.
// 3. **Una meta sólo se mide en su unidad**: la de comisión en pesos, la de
//    servicios en número. Mezclarlas daría un porcentaje que no significa nada.
//
// ## La cuarta regla, que llega con el selector de periodo
// 4. **Una meta sólo se mide en su periodo.** Medir la comisión de un mes contra
//    una meta diaria daría una barra al 3000 %: `avanceDelPeriodo` recibe la meta
//    **ya elegida** para ese periodo (`elegirMetaDelPeriodo`), y el selector de la
//    pantalla no puede saltarse ese paso porque no tiene otra forma de obtener la
//    meta que enseñar.

/** Origen de una meta: `personal` la fija el colaborador; `administracion`, el negocio. */
export type MetaOrigen = 'personal' | 'administracion';

/** Valores reales del `CHECK` de `public.metas.tipo` (migración 014). */
export type MetaTipo = 'comision' | 'servicios' | 'ticket_promedio' | 'pct_con_extras';

/** Valores reales del `CHECK` de `public.metas.periodo`. */
export type MetaPeriodo = 'dia' | 'semana' | 'mes';

/** En qué unidad se mide una meta. Nunca se formatean igual. */
export type UnidadMeta = 'moneda' | 'numero';

/**
 * Fila de `public.metas` con las columnas reales (migración 014).
 *
 * `objetivo` y `bono` son `numeric(14,0)` — **pesos enteros**, porque el peso
 * colombiano no usa centavos. PostgREST puede devolverlos como número o como
 * cadena; por eso el tipo admite las dos y quien los use pasa por `Number()`.
 */
export interface MetaFila {
  id: number;
  tenant_id: number;
  sucursal_id: number | null;
  colaborador_id: number | null;
  origen: MetaOrigen;
  tipo: MetaTipo;
  periodo: MetaPeriodo;
  objetivo: number | string;
  bono: number | string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activa: boolean;
  creada_por: number | null;
  created_at: string;
  updated_at: string;
}

const ETIQUETAS_TIPO: Record<MetaTipo, string> = {
  comision: 'Comisión ganada',
  servicios: 'Servicios realizados',
  ticket_promedio: 'Ticket promedio',
  pct_con_extras: 'Servicios con extras',
};

/** Etiqueta legible de un tipo, incluidos los que el portal no puede medir. */
export function etiquetaTipo(tipo: MetaTipo): string {
  return ETIQUETAS_TIPO[tipo] ?? tipo;
}

const ETIQUETAS_PERIODO: Record<MetaPeriodo, string> = {
  dia: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
};

/** Etiqueta legible de un periodo, en su forma larga: `Hoy`, `Esta semana`, `Este mes`. */
export function etiquetaPeriodo(periodo: MetaPeriodo): string {
  return ETIQUETAS_PERIODO[periodo] ?? periodo;
}

const ETIQUETAS_PERIODO_CORTAS: Record<MetaPeriodo, string> = {
  dia: 'Día',
  semana: 'Semana',
  mes: 'Mes',
};

/**
 * Etiqueta **corta** del periodo, para el selector `Día · Semana · Mes`.
 *
 * Es distinta de `etiquetaPeriodo` a propósito: en un botón de tres columnas
 * «Esta semana» no cabe, y en el encabezado de un panel «Semana» se lee peor que
 * «Esta semana». Cada sitio usa la forma que le corresponde.
 */
export function etiquetaPeriodoCorta(periodo: MetaPeriodo): string {
  return ETIQUETAS_PERIODO_CORTAS[periodo] ?? periodo;
}

const TITULOS_META: Record<MetaPeriodo, string> = {
  dia: 'Meta de hoy',
  semana: 'Meta de la semana',
  mes: 'Meta del mes',
};

/**
 * Cómo se llama la meta de cada periodo: `Meta de hoy`, `Meta de la semana`,
 * `Meta del mes`.
 *
 * Vive aquí —y no en el JSX— porque el mismo texto va en tres sitios (el
 * `aria-label` de la barra, la línea del objetivo y los mensajes de estado) y
 * tienen que decir exactamente lo mismo: si la barra midiera el mes con la
 * etiqueta «Meta de hoy», el porcentaje sería correcto y la lectura no.
 */
export function tituloMetaDelPeriodo(periodo: MetaPeriodo): string {
  return TITULOS_META[periodo] ?? 'Meta';
}

const TEXTOS_CUMPLIDA: Record<MetaPeriodo, string> = {
  dia: 'Meta del día cumplida. ¡Bien hecho!',
  semana: 'Meta de la semana cumplida. ¡Bien hecho!',
  mes: 'Meta del mes cumplida. ¡Bien hecho!',
};

/** Felicitación de meta cumplida, concordada con el periodo. */
export function textoMetaCumplida(periodo: MetaPeriodo): string {
  return TEXTOS_CUMPLIDA[periodo] ?? 'Meta cumplida. ¡Bien hecho!';
}

/** Los tres periodos, en orden de uso: hoy, esta semana, este mes. */
export const PERIODOS_META: readonly MetaPeriodo[] = ['dia', 'semana', 'mes'];

/**
 * Los dos tipos que el portal **puede medir** con los datos que ya tiene:
 * la comisión confirmada del día y el número de servicios cobrados.
 *
 * `ticket_promedio` y `pct_con_extras` existen en la base y se muestran (sólo
 * lectura si los fijó administración), pero el resumen de `/app` no los pinta:
 * calcularlos mal sería peor que decir que no se miden aquí.
 */
export const TIPOS_MEDIBLES: readonly MetaTipo[] = ['comision', 'servicios'];

/** `true` si el resumen de inicio puede pintar una barra para este tipo. */
export function esTipoMedible(tipo: MetaTipo): boolean {
  return TIPOS_MEDIBLES.includes(tipo);
}

/** Unidad de medida de un tipo de meta. Todo lo que no sea dinero es volumen. */
export function unidadDeTipo(tipo: MetaTipo): UnidadMeta {
  return tipo === 'comision' ? 'moneda' : 'numero';
}

// ─────────────────────────────────────────────────────────────────────────────
// Avance
// ─────────────────────────────────────────────────────────────────────────────

export interface AvanceMeta {
  /** Lo conseguido hasta ahora, en la unidad de la meta. */
  valor: number;
  /** El objetivo, redondeado a peso entero. `0` = sin objetivo. */
  maximo: number;
  unidad: UnidadMeta;
  /** 0–100, **acotado**: el tope visual es 100 aunque se haya superado. */
  pct: number;
  /** `true` sólo si se alcanzó o superó el objetivo. */
  cumplida: boolean;
  /** Cuánto falta para el objetivo (`0` si ya está). */
  falta: number;
}

/**
 * Avance de un objetivo. Es el **único** sitio donde se calcula el porcentaje,
 * para que el ancho pintado, el `%` visible y el `aria-valuenow` no diverjan.
 *
 * Con `objetivo <= 0` devuelve `pct: 0` y `cumplida: false`: no es un objetivo
 * cumplido, es un objetivo que no existe. Quien pinta decide (aquí: no pinta
 * barra y ofrece definir la meta).
 */
export function avanceDeMeta(
  objetivo: number | string,
  actual: number,
  unidad: UnidadMeta,
): AvanceMeta {
  const maximo = Math.max(0, Math.round(Number(objetivo) || 0));
  const valor = Number.isFinite(actual) ? Math.max(0, Number(actual)) : 0;

  if (maximo <= 0) {
    return { valor, maximo: 0, unidad, pct: 0, cumplida: false, falta: 0 };
  }

  const bruto = (valor / maximo) * 100;
  return {
    valor,
    maximo,
    unidad,
    pct: Math.min(100, Math.max(0, Math.round(bruto * 100) / 100)),
    cumplida: valor >= maximo,
    falta: Math.max(maximo - valor, 0),
  };
}

/** Lo conseguido en un periodo, en las dos unidades que el portal puede medir. */
export interface DatosDelPeriodo {
  /** Suma de las comisiones **confirmadas** del periodo (pesos). */
  confirmado: number;
  /** Servicios ya cobrados del periodo (volumen, no dinero). */
  serviciosConfirmados: number;
}

/**
 * Avance de una meta contra los datos de **su** periodo, cada uno en su unidad.
 *
 * El llamante debe pasar la meta que corresponde al periodo medido
 * (`elegirMetaDelPeriodo`). Aquí no se comprueba —este módulo es puro y no sabe
 * de dónde vienen los datos—, pero el nombre lo dice: si le llega una meta
 * semanal y un total mensual, el porcentaje será basura.
 */
export function avanceDelPeriodo(meta: MetaFila, datos: DatosDelPeriodo): AvanceMeta {
  const unidad = unidadDeTipo(meta.tipo);
  const actual = unidad === 'moneda' ? datos.confirmado : datos.serviciosConfirmados;
  return avanceDeMeta(meta.objetivo, actual, unidad);
}

// ─────────────────────────────────────────────────────────────────────────────
// Vigencia y elección de la meta del periodo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `true` si la meta está vigente en esa fecha.
 *
 * `vigente_desde` / `vigente_hasta` son columnas `date` (`YYYY-MM-DD`), así que
 * se comparan como texto: en ese formato el orden lexicográfico **es** el
 * cronológico, y convertirlas a `Date` las desplazaría un día en la zona del
 * negocio (UTC−5).
 */
export function metaVigenteHoy(meta: MetaFila, hoyISO: string): boolean {
  const desde = (meta.vigente_desde ?? '').slice(0, 10);
  const hasta = (meta.vigente_hasta ?? '').slice(0, 10);
  if (desde && desde > hoyISO) return false;
  if (hasta && hasta < hoyISO) return false;
  return true;
}

/**
 * La meta que manda en `periodo` para una persona.
 *
 * Sólo se consideran metas activas, **de ese periodo** y **con dueño** (una meta
 * de empresa no es el objetivo personal de nadie). Si administración le asignó
 * una y además tiene una personal, manda la de administración: es la que el
 * negocio mide, y mostrar la otra escondería la que cuenta.
 *
 * ⚠️ El filtro `m.periodo === periodo` es la razón de ser de esta función: sin
 * él, la comisión del mes se mediría contra la meta del día y la barra saldría al
 * 3000 %. Nada fuera de aquí elige metas para pintar una barra.
 */
export function elegirMetaDelPeriodo(
  metas: readonly MetaFila[],
  colaboradorId: number | null,
  hoyISO: string,
  periodo: MetaPeriodo,
): MetaFila | null {
  if (colaboradorId === null) return null;

  const candidatas = metas.filter(
    (m) =>
      m.activa &&
      m.periodo === periodo &&
      m.colaborador_id === colaboradorId &&
      metaVigenteHoy(m, hoyISO),
  );
  if (candidatas.length === 0) return null;

  const deAdministracion = candidatas.filter((m) => m.origen === 'administracion');
  const grupo = deAdministracion.length > 0 ? deAdministracion : candidatas;

  // La más reciente. `id` es una identidad monótona, así que ordena igual que
  // `created_at` sin depender de que la cadena de fecha venga bien formada.
  return [...grupo].sort((a, b) => b.id - a.id)[0];
}

/**
 * La meta que manda **hoy**.
 *
 * Se conserva porque es la que usa el resumen de inicio (`useMetaDelDia`): allí
 * sólo hay un periodo que enseñar y «la del día» es su nombre.
 */
export function elegirMetaDelDia(
  metas: readonly MetaFila[],
  colaboradorId: number | null,
  hoyISO: string,
): MetaFila | null {
  return elegirMetaDelPeriodo(metas, colaboradorId, hoyISO, 'dia');
}

/**
 * En qué periodos esta persona **tiene** una meta vigente.
 *
 * Lo usa el selector para marcar los periodos que llevan a alguna parte: una meta
 * semanal que no se enseña en ningún sitio es exactamente el problema que este
 * módulo resuelve, y marcarla permite verla sin tener que pulsar los tres botones.
 */
export function periodosConMeta(
  metas: readonly MetaFila[],
  colaboradorId: number | null,
  hoyISO: string,
): MetaPeriodo[] {
  return PERIODOS_META.filter(
    (periodo) => elegirMetaDelPeriodo(metas, colaboradorId, hoyISO, periodo) !== null,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulario
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Texto de un `<input type="number">` → pesos enteros.
 *
 * Devuelve `null` si no es un número mayor que cero. **Redondea**: el objetivo
 * es `numeric(14,0)` y el peso colombiano no tiene centavos, así que un
 * `45550.4` guardado como `45550` es lo correcto — y la UI enseña el importe ya
 * redondeado antes de guardarlo, para que nadie se lleve la sorpresa después.
 */
export function parsearObjetivo(texto: string): number | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** `true` si el rango de vigencia es coherente (el mismo `CHECK` de la base). */
export function vigenciaCoherente(desde: string, hasta: string | null): boolean {
  if (!hasta) return true;
  return hasta >= desde;
}

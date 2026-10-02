/**
 * Formato de dinero, fechas y números.
 *
 * **Regla del proyecto:** ningún componente usa `` `$${x.toFixed(2)}` `` ni
 * `new Date(...).toLocaleString()`. Todo pasa por aquí, para que el formato sea
 * consistente y haya un único sitio donde cambiarlo.
 *
 * ## La configuración es **de la base de datos**, no del código
 *
 * Este módulo arranca con unos valores por defecto (peso colombiano) y
 * `configurarFormato()` los reemplaza con lo que devuelve
 * `GET /parametros/formato` al iniciar sesión. Así, cambiar de moneda es
 * **cambiar un parámetro**, no desplegar código.
 *
 * Los formateadores de `Intl` son caros de construir, así que se cachean y la
 * caché se invalida sola cuando cambia el locale o la zona horaria (de ahí la
 * `clave`).
 */

/** Monedas soportadas de fábrica. Añadir una es añadir una fila aquí. */
export const MONEDAS = {
  COP: { nombre: 'Peso colombiano', simbolo: '$', locale: 'es-CO', decimales: 0 },
  USD: { nombre: 'Dólar estadounidense', simbolo: '$', locale: 'en-US', decimales: 2 },
  EUR: { nombre: 'Euro', simbolo: '€', locale: 'es-ES', decimales: 2 },
  MXN: { nombre: 'Peso mexicano', simbolo: '$', locale: 'es-MX', decimales: 2 },
  PEN: { nombre: 'Sol peruano', simbolo: 'S/', locale: 'es-PE', decimales: 2 },
  CLP: { nombre: 'Peso chileno', simbolo: '$', locale: 'es-CL', decimales: 0 },
  ARS: { nombre: 'Peso argentino', simbolo: '$', locale: 'es-AR', decimales: 2 },
  PAB: { nombre: 'Balboa panameño', simbolo: 'B/.', locale: 'es-PA', decimales: 2 },
  DOP: { nombre: 'Peso dominicano', simbolo: 'RD$', locale: 'es-DO', decimales: 2 },
  BRL: { nombre: 'Real brasileño', simbolo: 'R$', locale: 'pt-BR', decimales: 2 },
} as const;

export type CodigoMoneda = keyof typeof MONEDAS;

/**
 * Configuración de moneda **activa**. Es un objeto mutable a propósito: se
 * modifica en caliente con `configurarFormato()` y todo el formateo lo lee.
 */
export const MONEDA = {
  codigo: 'COP' as string,
  simbolo: '$',
  locale: 'es-CO',
  decimales: 0,
  /**
   * `true` si los importes se guardan en **centavos** (hay que dividir entre 100
   * al mostrar). El peso colombiano es de denominación alta y **no** usa
   * centavos: `100000` son $100.000, no $1.000,00.
   */
  centavos: false,
};

/**
 * Zona horaria del negocio. Configurable (`negocio.zona_horaria`).
 *
 * ⚠️ **Un corte semanal mal calculado por zona horaria liquida los servicios en
 * la semana equivocada**, así que este valor debe coincidir con el que usa el
 * servidor para calcular las liquidaciones.
 */
export let TZ = 'America/Bogota';

export interface ConfigFormato {
  moneda: {
    codigo: string;
    simbolo: string;
    locale: string;
    decimales: number;
    centavos: boolean;
  };
  zonaHoraria: string;
}

/** Aplica la configuración que llega del backend. */
export function configurarFormato(cfg: Partial<ConfigFormato>): void {
  if (cfg.moneda) {
    MONEDA.codigo = cfg.moneda.codigo ?? MONEDA.codigo;
    MONEDA.simbolo = cfg.moneda.simbolo ?? MONEDA.simbolo;
    MONEDA.locale = cfg.moneda.locale ?? MONEDA.locale;
    MONEDA.decimales = cfg.moneda.decimales ?? MONEDA.decimales;
    MONEDA.centavos = cfg.moneda.centavos ?? MONEDA.centavos;
  }
  if (cfg.zonaHoraria) TZ = cfg.zonaHoraria;
  cacheFormatters = null; // los formateadores dependen del locale y de la zona
}

/** Devuelve una copia de la configuración activa (para pintarla en ajustes). */
export function obtenerFormato(): ConfigFormato {
  return { moneda: { ...MONEDA }, zonaHoraria: TZ };
}

/** Aplica el preset de una moneda soportada. */
export function aplicarPresetMoneda(codigo: CodigoMoneda): void {
  const p = MONEDAS[codigo];
  configurarFormato({
    moneda: {
      codigo,
      simbolo: p.simbolo,
      locale: p.locale,
      decimales: p.decimales,
      centavos: false,
    },
  });
}

/** Convierte lo que viene de la API al valor decimal que se muestra. */
export function aUnidades(valor: number | string | null | undefined): number {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return 0;
  return MONEDA.centavos ? n / 100 : n;
}

/** Redondeo a 2 decimales evitando el sesgo binario de `toFixed`. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Formatea un importe.
 * @example formatMoney(100000)   → "$100.000"      (COP)
 * @example formatMoney(1234.5)   → "$1,234.50"     (USD)
 * @example formatMoney(12.5, {signo:true}) → "+$12.50"
 */
export function formatMoney(
  valor: number | string | null | undefined,
  opts: { signo?: boolean; decimales?: number } = {},
): string {
  const v = aUnidades(valor);
  const decimales = opts.decimales ?? MONEDA.decimales;
  const cuerpo = new Intl.NumberFormat(MONEDA.locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Math.abs(v));

  const negativo = v < 0;
  const prefijo = negativo ? '−' : opts.signo && v > 0 ? '+' : '';
  return `${prefijo}${MONEDA.simbolo}${cuerpo}`;
}

/** Formatea un número entero con separadores de miles. */
export function formatNumero(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat(MONEDA.locale, { maximumFractionDigits: 0 }).format(n);
}

/** Formatea un porcentaje. */
export function formatPorcentaje(
  valor: number | string | null | undefined,
  decimales = 2,
): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return '0%';
  return `${new Intl.NumberFormat(MONEDA.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  }).format(n)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fechas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formateadores de fecha, construidos **a demanda**.
 *
 * No pueden crearse al cargar el módulo: si la configuración cambia después
 * (otra zona horaria, otro idioma), seguirían usando la antigua. Se cachean
 * contra la pareja `locale|zona` para no reconstruirlos en cada llamada.
 */
let cacheFormatters: {
  clave: string;
  fecha: Intl.DateTimeFormat;
  hora: Intl.DateTimeFormat;
  fechaHora: Intl.DateTimeFormat;
  diaSemana: Intl.DateTimeFormat;
} | null = null;

function formatters() {
  const clave = `${MONEDA.locale}|${TZ}`;
  if (cacheFormatters?.clave === clave) return cacheFormatters;

  cacheFormatters = {
    clave,
    fecha: new Intl.DateTimeFormat(MONEDA.locale, {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ,
    }),
    hora: new Intl.DateTimeFormat(MONEDA.locale, {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ,
    }),
    fechaHora: new Intl.DateTimeFormat(MONEDA.locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ,
    }),
    diaSemana: new Intl.DateTimeFormat(MONEDA.locale, {
      weekday: 'long', timeZone: TZ,
    }),
  };
  return cacheFormatters;
}

/** `2026-02-23T18:04:11Z` → `23 feb 2026` */
export function formatFecha(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return formatters().fecha.format(d);
}

/** `2026-02-23T18:04:11Z` → `01:04 p. m.` */
export function formatHora(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return formatters().hora.format(d);
}

/** `2026-02-23T18:04:11Z` → `23 feb 2026, 01:04 p. m.` */
export function formatFechaHora(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return formatters().fechaHora.format(d);
}

/** `Hoy`, `Ayer`, `Hace 3 días` o la fecha. Para bandejas de pendientes. */
export function formatRelativo(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';

  const ms = Date.now() - d.getTime();
  const horas = ms / 3_600_000;

  if (horas < 1) {
    const min = Math.max(1, Math.round(ms / 60_000));
    return `Hace ${min} min`;
  }
  if (horas < 24) return `Hace ${Math.round(horas)} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return formatFecha(d);
}

/** `YYYY-MM-DD` en la zona del negocio (para query params de la API). */
export function aISODate(d: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ,
  }).format(d);
  return partes;
}

/** Lunes 00:00 de la semana a la que pertenece `d`. */
export function lunesDe(d: Date = new Date()): Date {
  const local = new Date(d);
  const dia = local.getDay(); // 0 = domingo
  const offset = dia === 0 ? -6 : 1 - dia;
  local.setDate(local.getDate() + offset);
  local.setHours(0, 0, 0, 0);
  return local;
}

/** Rango `lunes → domingo` de la semana a la que pertenece `d`. */
export function rangoSemana(d: Date = new Date()): { inicio: Date; fin: Date } {
  const inicio = lunesDe(d);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

/** Nombre del día de la semana, capitalizado. */
export function nombreDia(d: Date | string): string {
  const fecha = typeof d === 'string' ? new Date(d) : d;
  const nombre = formatters().diaSemana.format(fecha);
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/** Etiqueta legible de un periodo: `17 – 23 feb 2026`. */
export function formatPeriodo(inicio: string, fin: string): string {
  return `${formatFecha(inicio)} – ${formatFecha(fin)}`;
}

/** Iniciales para avatares: `Carlos Méndez` → `CM`. */
export function iniciales(nombre: string | null | undefined): string {
  if (!nombre) return '?';
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/** Atajo de teclado según plataforma. */
export const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';

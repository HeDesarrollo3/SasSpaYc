/**
 * Rangos de fecha para filtrar `comandas` (y cualquier `timestamptz`).
 *
 * ## El bug que resuelve este archivo
 *
 * La versión anterior construía el rango así:
 * ```
 * desde = "2026-09-29T00:00:00"     // sin zona horaria
 * hasta = "2026-09-30T00:00:00"
 * ```
 * y el backend lo manda a Postgres como `gte`/`lte` sobre una columna
 * `timestamptz`. **Postgres interpreta un timestamp sin zona en la zona del
 * servidor**, que en Supabase es **UTC**, no la del negocio. Así que el rango
 * real era 29-sep 00:00 **UTC** → 30-sep 00:00 **UTC**.
 *
 * Y ahí está el fallo: un servicio hecho a las **20:03 en Bogotá** se guarda como
 * `2026-09-30T01:03Z` — las 00:03 del día siguiente en UTC. El filtro de «hoy» lo
 * dejaba fuera por una hora.
 *
 * Traducido: **cualquier servicio registrado después de las 19:00 en Colombia
 * desaparecía del filtro de «hoy»**. Y como el contador de pendientes no lleva
 * filtro de fecha, la pantalla se contradecía consigo misma: «pendientes: 2» pero
 * «hoy has registrado: 0».
 *
 * La ironía es que el comentario del código anterior avisaba exactamente de esto
 * («un servicio de las 20:00 caería en el día siguiente»), pero la solución
 * aplicada — quitar la `Z`— no lo arreglaba: lo causaba.
 *
 * ## La solución
 *
 * Mandar **instantes absolutos en UTC**, calculando a qué instante UTC
 * corresponde la medianoche **de la zona del negocio**:
 * ```
 * desde = "2026-09-29T05:00:00.000Z"   // 00:00 en Bogotá (UTC−5)
 * hasta = "2026-09-29T04:59:59.999Z"   // 23:59:59.999 en Bogotá
 * ```
 * Así el rango significa lo mismo para el navegador y para Postgres.
 *
 * ⚠️ **Sin dependencias a propósito**: es lógica pura de fechas, para poder
 * probarla con `node scripts/verificar-fechas.mjs` sin arrancar React.
 */
import { aISODate, lunesDe, TZ } from './format';

export type RangoFechas = { desde: string; hasta: string };

/**
 * Desfase de la zona del negocio respecto a UTC, en milisegundos, **en ese
 * instante concreto**.
 *
 * Se formatea el MISMO instante en UTC y en la zona del negocio con `sv-SE`
 * (que produce `YYYY-MM-DD HH:mm:ss`, un formato que `Date` parsea igual en
 * ambos casos) y se restan. Así el desfase sale sin parsear formatos
 * localizados a mano y sin asumir que la zona no tiene horario de verano.
 */
function desfaseZona(instante: Date): number {
  const enUtc = new Date(instante.toLocaleString('sv-SE', { timeZone: 'UTC' }));
  const enZona = new Date(instante.toLocaleString('sv-SE', { timeZone: TZ }));
  return enZona.getTime() - enUtc.getTime();
}

/** Suma días a un `YYYY-MM-DD`. Usa mediodía UTC para no tropezar con bordes. */
function sumarDias(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * El instante UTC que corresponde a las **00:00 de `ymd` en la zona del negocio**.
 *
 * @example medianocheEnZona('2026-09-29') en Bogotá → 2026-09-29T05:00:00.000Z
 */
export function medianocheEnZona(ymd: string): Date {
  const ingenuo = new Date(`${ymd}T00:00:00Z`);
  const desfase = desfaseZona(ingenuo);
  return new Date(ingenuo.getTime() - desfase);
}

/** Inicio del día de negocio que contiene `d`, como instante ISO en UTC. */
function desdeElDia(ymd: string): string {
  return medianocheEnZona(ymd).toISOString();
}

/**
 * Fin del día `ymd`, como instante ISO en UTC.
 *
 * Se usa `23:59:59.999` de ese día en lugar de la medianoche del siguiente: el
 * backend filtra con `lte`, así que un final «exclusivo» incluiría también el
 * primer instante del día siguiente.
 */
function hastaElDia(ymd: string): string {
  return new Date(medianocheEnZona(sumarDias(ymd, 1)).getTime() - 1).toISOString();
}

/** El día de hoy en la zona del negocio. */
export function rangoHoy(hoy: Date = new Date()): RangoFechas {
  const ymd = aISODate(hoy);
  return { desde: desdeElDia(ymd), hasta: hastaElDia(ymd) };
}

/**
 * El día **anterior**. Sirve para comparar («hoy vas +12 % que ayer»), que es lo
 * único que convierte una cifra en información: un número sin referencia no dice
 * si el negocio va bien o mal.
 */
export function rangoAyer(hoy: Date = new Date()): RangoFechas {
  const ymd = sumarDias(aISODate(hoy), -1);
  return { desde: desdeElDia(ymd), hasta: hastaElDia(ymd) };
}

/** La semana en curso: lunes a domingo, en la zona del negocio. */
export function rangoSemanaEnCurso(hoy: Date = new Date()): RangoFechas {
  const lunesYmd = aISODate(lunesDe(hoy));
  const domingoYmd = sumarDias(lunesYmd, 6);
  return { desde: desdeElDia(lunesYmd), hasta: hastaElDia(domingoYmd) };
}

/** El mes en curso, en la zona del negocio. */
export function rangoMesEnCurso(hoy: Date = new Date()): RangoFechas {
  const ymd = aISODate(hoy);
  const primerDia = `${ymd.slice(0, 7)}-01`;
  const primerDiaSiguiente = `${ymd.slice(0, 7)}-01`;
  const d = new Date(`${primerDiaSiguiente}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const ultimoDia = new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
  return { desde: desdeElDia(primerDia), hasta: hastaElDia(ultimoDia) };
}

/**
 * Rango personalizado a partir de dos `YYYY-MM-DD` de un `<input type="date">`.
 * El fin es **inclusivo**: el servicio de las 15:00 del último día entra.
 */
export function rangoPersonalizado(desde: string, hasta: string): RangoFechas {
  return {
    desde: desde ? desdeElDia(desde) : '',
    hasta: hasta ? hastaElDia(hasta) : '',
  };
}

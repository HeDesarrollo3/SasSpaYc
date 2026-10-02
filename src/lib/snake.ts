/**
 * Conversión entre `camelCase` (frontend) y `snake_case` (API).
 *
 * **Por qué existe este archivo:** el backend habla `snake_case` (los DTO usan
 * `class-validator` con `forbidNonWhitelisted: true`), pero buena parte del
 * frontend enviaba `camelCase`. Con `forbidNonWhitelisted` eso es un
 * `400 VALIDATION_ERROR`, y era la causa de que cajas, checkout y cuentas
 * estuvieran rotos de punta a punta.
 *
 * **Regla:** ningún componente arma el payload a mano. Todo pasa por el mapper
 * del feature, que usa estas funciones.
 */

type Plano = Record<string, unknown>;

function esPlano(v: unknown): v is Plano {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

/**
 * `camelCase` → `snake_case`, recursivo sobre objetos y arrays.
 *
 * Los valores `undefined` se descartan: el backend tiene defaults que no
 * queremos pisar, y enviar claves de más es un `400` con `forbidNonWhitelisted`.
 */
export function toSnake<T = Plano>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map((i) => toSnake(i)) as unknown as T;
  }
  if (!esPlano(input)) return input as T;

  const salida: Plano = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    const clave = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    salida[clave] = esPlano(v) ? toSnake(v) : Array.isArray(v) ? toSnake(v) : v;
  }
  return salida as T;
}

/** `snake_case` → `camelCase`, recursivo. */
export function toCamel<T = Plano>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map((i) => toCamel(i)) as unknown as T;
  }
  if (!esPlano(input)) return input as T;

  const salida: Plano = {};
  for (const [k, v] of Object.entries(input)) {
    const clave = k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    salida[clave] = esPlano(v) ? toCamel(v) : Array.isArray(v) ? toCamel(v) : v;
  }
  return salida as T;
}

/** Quita las claves con valor `undefined` de un objeto plano (sin recursión). */
export function sinUndefined<T extends Plano>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Normaliza cadenas vacías a `null`.
 *
 * Los formularios devuelven `''` para campos opcionales vacíos, y el backend
 * espera `null` (o el campo ausente). Enviar `''` a un campo opcional suele
 * provocar errores de tipo o de CHECK.
 */
export function vacioANull<T extends Plano>(obj: T): T {
  for (const [k, v] of Object.entries(obj)) {
    if (v === '') (obj as Plano)[k] = null;
  }
  return obj;
}

// src/services/comandas.service.ts
import { api, type ApiSuccess, type Paginated } from './api';
import { toSnake } from '../lib/snake';

/**
 * Comandas — el **registro de servicio del colaborador**: la pieza que el portal
 * móvil (`/app`) usa para registrar un servicio y ver su estado de cobro.
 *
 * Contrato real (verificado leyendo el backend y las migraciones 005/006, no
 * supuesto):
 *
 * - `comandas.estado` va en **minúsculas** (`borrador | pendiente | confirmada |
 *   rechazada | anulada`), a diferencia de `ventas.estado`, que va en
 *   MAYÚSCULAS. Los tipos de aquí reflejan eso.
 * - Las claves viajan en **snake_case**; las entradas de este servicio son
 *   `camelCase` y se traducen al salir con `toSnake()` (que además **descarta los
 *   `undefined`**, porque el backend valida con `forbidNonWhitelisted`).
 * - ⚠️ **`colaborador_id` es obligatorio en el DTO del backend** (`CrearComandaDto`),
 *   aunque el servicio lo ignore y use el del usuario autenticado cuando el rol
 *   es `colaborador` (`comandas.service.ts:74-79`). Por eso `crear()` no lo manda
 *   a menos que se lo pasen: quien lo tiene es la capa de página, que lo lee de
 *   `useAuthStore().user.colaborador_id`. Ver la nota en el README de limitaciones.
 * - `GET /comandas/pendientes` **no acepta query params** (el controller no lee
 *   `@Query()`): es un atajo fijo de `?estado=pendiente`. Si necesitas filtrar,
 *   usa `listar()`.
 *
 * ⚠️⚠️ Mientras no se apliquen las migraciones **005 y 006**, *todos* estos
 * endpoints responden `500 INTERNAL_ERROR` con el mensaje *"Falta una tabla en la
 * base de datos. Aplica las migraciones pendientes de `supabase/migrations/`."*
 * Eso **no es un fallo**: usa `esErrorMigraciones(error)` para pintar un banner
 * informativo en lugar de un error rojo genérico.
 */

// ---------------------------------------------------------------------------
// Tipos del backend (tal como llegan)
// ---------------------------------------------------------------------------

/** Estados reales de `comandas.estado` (migración 005) — en minúsculas. */
export type ComandaEstado = 'borrador' | 'pendiente' | 'confirmada' | 'rechazada' | 'anulada';

/** Extra de una línea: fila de `comanda_item_extras`. */
export interface ComandaItemExtra {
  id: number;
  /** FK a `comanda_items` (el backend la usa para agrupar, no se pinta). */
  comanda_item_id: number;
  /** `null` = extra manual (sólo lo pueden escribir roles distintos de colaborador). */
  adicional_id: number | null;
  descripcion: string;
  cantidad: number;
  monto_unitario: number;
  comisionable: boolean;
  porcentaje_colaborador: number | null;
  /** Se persiste al confirmar el cobro; `null` mientras la comanda no se cobra. */
  comision_monto: number | null;
  created_at: string;
}

/** Línea de servicio: fila de `comanda_items`. */
export interface ComandaItem {
  id: number;
  comanda_id: number;
  servicio_id: number;
  /** Quién ejecutó ESTA línea; puede diferir del dueño de la comanda. */
  colaborador_id: number | null;
  cantidad: number;
  /** Sólo para extras con `tipo_precio = por_hora`. */
  horas: number | null;
  /** Estimado al crear. Lo resuelve el servidor desde el catálogo. */
  precio_unitario_estimado: number;
  /** Definitivo, congelado al confirmar el cobro. */
  precio_unitario_confirmado: number | null;
  descuento_linea: number;
  subtotal_confirmado: number | null;
  /** Precedencia: línea > servicio > colaborador. `null` hasta el cobro. */
  porcentaje_comision_aplicado: number | null;
  base_comision: number | null;
  comision_monto: number | null;
  /** `linea | servicio | colaborador | ninguno`. */
  comision_origen: string | null;
  /** La usa el backend para no liquidar dos veces la misma línea. */
  liquidado?: boolean;
  notas: string | null;
  created_at?: string;
  extras: ComandaItemExtra[];
}

/** Fila de `comandas` (migración 005) + `items` en el detalle. */
export interface Comanda {
  id: number;
  /** Folio legible tipo `CMD-20260223-0042`. */
  folio: string;
  cliente_id: number | null;
  /** Nombre libre cuando el cliente no está registrado: el caso normal en un spa. */
  cliente_nombre: string | null;
  colaborador_id: number;
  estado: ComandaEstado;
  /** `timestamptz`: instante del servicio, no una fecha suelta. */
  fecha_servicio: string;
  subtotal_estimado: number;
  total_estimado: number;
  subtotal_confirmado: number | null;
  descuento_confirmado: number;
  propina_confirmada: number;
  total_confirmado: number | null;
  venta_id: number | null;
  caja_id: number | null;
  observaciones: string | null;
  enviada_at: string | null;
  confirmada_at: string | null;
  rechazada_at: string | null;
  motivo_rechazo: string | null;
  forma_pago: string | null;
  /** El cliente lo trajo el colaborador (migración 023). */
  cliente_referido?: boolean;
  created_at: string;
  updated_at: string;
  /**
   * ⚠️ `GET /comandas` hace `select('*')` **sin** traer las líneas: en el listado
   * esto siempre llega `[]`. Sólo `obtener()` devuelve los ítems con sus extras.
   */
  items?: ComandaItem[];
}

/** Respuesta de `POST /comandas` (RPC `crear_comanda`). */
export interface ComandaCreada {
  comanda_id: number;
  folio: string;
  estado: ComandaEstado;
  total_estimado: number;
}

/** Respuesta de `enviar` / `rechazar` (RPC). */
export interface ComandaTransicion {
  comanda_id: number;
  estado: ComandaEstado;
}

// ---------------------------------------------------------------------------
// Entradas del frontend (camelCase → snake_case al enviar)
// ---------------------------------------------------------------------------

export interface ListarComandasFiltros {
  estado?: ComandaEstado;
  /**
   * ⚠️ El portal **no** debe mandarlo: el backend fuerza el del colaborador
   * autenticado (`alcanceDe()`), y para los demás roles el filtro se ignora.
   * Se deja disponible para pantallas de escritorio que reutilicen el servicio.
   */
  colaboradorId?: number;
  clienteId?: number;
  /** ISO 8601. Se compara contra `fecha_servicio` (>=). */
  desde?: string;
  /** ISO 8601. Se compara contra `fecha_servicio` (<=). */
  hasta?: string;
  /** Sólo comandas pendientes de hace más de N horas ("dinero sin entrar"). */
  antiguedadHoras?: number;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface ExtraComandaInput {
  /** Extra del catálogo… */
  adicionalId?: number;
  /** …o adicional escrito a mano por el colaborador (migración 024). */
  descripcion?: string;
  montoUnitario?: number;
  cantidad?: number;
  notas?: string;
}

export interface ItemComandaInput {
  servicioId: number;
  /** Sólo servicios de precio variable: valor elegido dentro del rango. */
  precioUnitario?: number;
  cantidad?: number;
  /** Para extras con `tipo_precio = por_hora`. */
  horas?: number;
  extras?: ExtraComandaInput[];
  notas?: string;
}

export interface CrearComandaInput {
  /**
   * ⚠️ Obligatorio en el DTO del backend aunque el rol `colaborador` sea quien
   * crea: si se omite, `forbidNonWhitelisted`/`@IsNotEmpty` lo rechaza con 400
   * **antes** de que el servicio pueda sustituirlo. Se envía el del usuario
   * autenticado; el backend lo pisa con el suyo de todas formas.
   */
  colaboradorId?: number;
  clienteId?: number;
  /** Nombre manual, cuando el cliente no está registrado (lo habitual). */
  clienteNombre?: string;
  /** ISO 8601 de la hora del servicio. Si se omite, la base usa `now()`. */
  fechaServicio?: string;
  observaciones?: string;
  /** `true` = nace en `pendiente` y entra directo a la bandeja de cobro. */
  enviar?: boolean;
  /** Cliente traído por el colaborador (comisión de referido, solo cabello). */
  clienteReferido?: boolean;
  items: ItemComandaInput[];
}

// ---------------------------------------------------------------------------
// Utilidades del contrato
// ---------------------------------------------------------------------------

/** La tabla `comandas` exige `cliente_id` **o** `cliente_nombre`. */
export function comandaTieneCliente(c: Pick<Comanda, 'cliente_id' | 'cliente_nombre'>): boolean {
  return c.cliente_id !== null || (c.cliente_nombre ?? '').trim().length > 0;
}

/** Nombre a mostrar del cliente, con reserva si la comanda no lo trae. */
export function nombreCliente(c: Comanda): string {
  return c.cliente_nombre?.trim() || (c.cliente_id ? `Cliente #${c.cliente_id}` : 'Sin cliente');
}

/** Importe "bueno" de una comanda: el confirmado si existe, si no el estimado. */
export function totalComanda(c: Comanda): number {
  return Number(c.total_confirmado ?? c.total_estimado ?? 0);
}

/**
 * Comisión persistida de una comanda (suma de sus líneas).
 *
 * ⚠️ Sólo hay valor **después** de confirmar el cobro: la base congela
 * `comision_monto` en la RPC `confirmar_comanda`. Antes de eso devuelve `0`, no
 * una estimación: la estimación se calcula en el cliente con el catálogo.
 *
 * Necesita el detalle (`obtener`): el listado no trae las líneas.
 */
export function comisionComanda(c: Comanda): number {
  return (c.items ?? []).reduce((acc, i) => acc + Number(i.comision_monto ?? 0), 0);
}

/**
 * Subtotal estimado de una línea tal como lo calcula la RPC:
 * `precio_unitario_estimado × cantidad`. Sin precios del cliente.
 */
export function subtotalLinea(item: ComandaItem): number {
  return Number(item.precio_unitario_estimado ?? 0) * Number(item.cantidad ?? 0);
}

/** Suma de los extras de una línea (informativo: ya vienen con su monto). */
export function subtotalExtras(item: ComandaItem): number {
  return (item.extras ?? []).reduce(
    (acc, e) => acc + Number(e.monto_unitario ?? 0) * Number(e.cantidad ?? 0),
    0,
  );
}

/**
 * Texto exacto que devuelve el backend cuando falta una migración.
 * Se compara en minúsculas y por fragmento para no depender de la puntuación.
 */
const FRAGMENTO_MIGRACIONES = 'migraciones pendientes';

/**
 * `true` si el error de la API es el aviso de migraciones sin aplicar.
 *
 * El backend responde `500 INTERNAL_ERROR` con *"…Aplica las migraciones
 * pendientes de `supabase/migrations/`."* mientras falten las migraciones 005/006
 * de comandas. Eso **no es un fallo del portal**: la UI debe explicarlo, no
 * pintarlo como un error rojo genérico.
 */
export function esErrorMigraciones(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: unknown; error?: unknown };
  const mensaje = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const codigo = typeof e.error === 'string' ? e.error.toUpperCase() : '';
  return (
    mensaje.includes(FRAGMENTO_MIGRACIONES) ||
    // El mapper del backend también emite `MIGRACION_PENDIENTE` en algunos casos.
    codigo === 'MIGRACION_PENDIENTE'
  );
}

/** Mensaje legible de un error de la API (envelope `{ error, message }`). */
export function mensajeApi(
  error: unknown,
  porDefecto = 'No se pudo completar la operación.',
): string {
  if (!error || typeof error !== 'object') return porDefecto;
  const e = error as { message?: unknown };
  return typeof e.message === 'string' && e.message.trim() ? e.message : porDefecto;
}

/** Código estable del error (`INTERNAL_ERROR`, `FORBIDDEN`, …). */
export function codigoApi(error: unknown): string {
  if (!error || typeof error !== 'object') return 'NETWORK_ERROR';
  const e = error as { error?: unknown };
  return typeof e.error === 'string' ? e.error : 'INTERNAL_ERROR';
}

// ---------------------------------------------------------------------------
// Claves de caché (una sola fuente para invalidar desde cualquier página)
// ---------------------------------------------------------------------------
export const COMANDAS_KEY = 'comandas';

export const comandasKeys = {
  /** Raíz: invalida listados, contadores y detalles a la vez. */
  todas: [COMANDAS_KEY] as const,
  listas: () => [COMANDAS_KEY, 'lista'] as const,
  lista: (filtros: ListarComandasFiltros) => [COMANDAS_KEY, 'lista', filtros] as const,
  detalle: (id: number) => [COMANDAS_KEY, 'detalle', id] as const,
  pendientes: () => [COMANDAS_KEY, 'pendientes'] as const,
  conteoPendientes: () => [COMANDAS_KEY, 'conteo-pendientes'] as const,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const ComandasService = {
  /**
   * `GET /comandas` — colección paginada `{ data, meta }`.
   *
   * ⚠️ Para el rol `colaborador` el backend **fuerza** su propio
   * `colaborador_id`: no hace falta mandarlo y mandar otro no sirve de nada (el
   * filtro se aplica en el servidor).
   */
  listar: async (filtros: ListarComandasFiltros = {}): Promise<Paginated<Comanda>> => {
    const qs = new URLSearchParams();
    if (filtros.estado) qs.set('estado', filtros.estado);
    if (filtros.colaboradorId !== undefined) {
      qs.set('colaborador_id', String(filtros.colaboradorId));
    }
    if (filtros.clienteId !== undefined) qs.set('cliente_id', String(filtros.clienteId));
    if (filtros.desde) qs.set('desde', filtros.desde);
    if (filtros.hasta) qs.set('hasta', filtros.hasta);
    if (filtros.antiguedadHoras !== undefined) {
      qs.set('antiguedad_horas', String(filtros.antiguedadHoras));
    }
    qs.set('page', String(filtros.page ?? 1));
    qs.set('limit', String(filtros.limit ?? 20));
    // `-fecha_servicio` = más recientes primero (lo valida `parseSortParam`).
    qs.set('sort', filtros.sort ?? '-fecha_servicio');

    return api.get<unknown, Paginated<Comanda>>(`/comandas?${qs.toString()}`);
  },

  /**
   * `GET /comandas/pendientes` — atajo de `?estado=pendiente` ordenado por
   * antigüedad. El controller **no lee filtros**, así que sólo se puede ajustar
   * el tamaño de página; para cualquier otro filtro usa `listar()`.
   */
  listarPendientes: async (limit = 50): Promise<Paginated<Comanda>> => {
    return api.get<unknown, Paginated<Comanda>>(`/comandas/pendientes?limit=${limit}`);
  },

  /**
   * `GET /comandas/pendientes/count` → `{ pendientes: number }`.
   *
   * ⚠️ El backend usa un `select` normal (no `head: true`) **a propósito**: con
   * `head` el error de "tabla ausente" se perdía y el contador devolvía 0 en
   * silencio. Aquí, si falta la migración, la promesa se rechaza y la UI lo dice.
   */
  contarPendientes: async (): Promise<{ pendientes: number }> => {
    const res = await api.get<unknown, ApiSuccess<{ pendientes: number }>>(
      '/comandas/pendientes/count',
    );
    return res.data ?? { pendientes: 0 };
  },

  /** `GET /comandas/:id` — cabecera + `items` (cada uno con sus `extras`). */
  obtener: async (id: number): Promise<Comanda> => {
    const res = await api.get<unknown, ApiSuccess<Comanda>>(`/comandas/${id}`);
    return res.data;
  },

  /**
   * `POST /comandas` — registra el servicio. **No acepta precios**: sólo ids y
   * cantidades (regla *Numeric Authority*). El importe lo resuelve la base desde
   * el catálogo y lo devuelve en `total_estimado`.
   *
   * `enviar: true` salta el estado `borrador` y lo deja en la bandeja de cobro de
   * recepción. Es lo que usa el portal: el colaborador registra y envía, no
   * confirma cobros.
   */
  crear: async (input: CrearComandaInput): Promise<ComandaCreada> => {
    const payload = toSnake<Record<string, unknown>>({
      colaboradorId: input.colaboradorId,
      clienteId: input.clienteId,
      clienteNombre: input.clienteNombre,
      fechaServicio: input.fechaServicio,
      observaciones: input.observaciones,
      enviar: input.enviar ?? true,
      clienteReferido: input.clienteReferido || undefined,
      items: input.items.map((item) => ({
        servicioId: item.servicioId,
        cantidad: item.cantidad ?? 1,
        horas: item.horas,
        notas: item.notas,
        precioUnitario: item.precioUnitario,
        extras: item.extras?.map((extra) => ({
          adicionalId: extra.adicionalId,
          descripcion: extra.descripcion,
          montoUnitario: extra.montoUnitario,
          cantidad: extra.cantidad ?? 1,
          notas: extra.notas,
        })),
      })),
    });

    const res = await api.post<unknown, ApiSuccess<ComandaCreada>>('/comandas', payload);
    return res.data;
  },

  /**
   * `POST /comandas/:id/enviar` — `borrador → pendiente`.
   *
   * El portal crea siempre con `enviar: true`, así que esto sólo hace falta si una
   * comanda quedó en borrador (rechazo de red, creación desde otra pantalla).
   */
  enviar: async (id: number, observaciones?: string): Promise<ComandaTransicion> => {
    const res = await api.post<unknown, ApiSuccess<ComandaTransicion>>(`/comandas/${id}/enviar`, {
      observaciones: observaciones ?? null,
    });
    return res.data;
  },

  /**
   * `POST /comandas/:id/rechazar` — sólo `administrador | recepcionista | cajero`.
   *
   * ⚠️ **El portal del colaborador no lo usa** (le devolvería `403 FORBIDDEN`): el
   * rechazo lo hace recepción o caja, con un motivo que el colaborador ve después
   * en el estado de su servicio. Se expone aquí para que el servicio refleje el
   * contrato completo del módulo.
   */
  rechazar: async (id: number, motivo: string): Promise<ComandaTransicion> => {
    const res = await api.post<unknown, ApiSuccess<ComandaTransicion>>(`/comandas/${id}/rechazar`, {
      motivo,
    });
    return res.data;
  },
};

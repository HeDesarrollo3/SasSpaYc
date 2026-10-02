// src/components/portal/metas.ts
//
// Hooks de React Query de las metas del colaborador, **contra el backend**.
//
// ## Lo que cambió y por qué
// Antes este archivo hablaba **directo con Supabase** (`supabase.from('metas')`),
// saltándose el backend. Era la única vía que existía, pero contradice la decisión
// de que *el backend es la puerta única*: la política RLS `tenant_aislamiento` de
// `metas` aísla por **empresa**, no por **dueño**, así que leer la tabla desde el
// cliente dejaba el filtro por persona en manos de la pantalla.
//
// Ahora todo pasa por `GET/POST/PATCH/DELETE /api/v1/me/metas`, donde el
// `colaborador_id` sale **siempre de la sesión**: no hay forma de pedir la meta de
// otra persona, ni de crear una con bono, ni de tocar una de administración.
//
// ## Por qué ya no hay `usePuedeEscribirMetas`
// Aquel hook **probaba** el permiso real de la base (`INSERT`/`UPDATE`/`DELETE`
// contra `id = -1`) porque la migración `016` revoca la escritura a
// `authenticated` y dejaba `metas` en sólo lectura: sin la comprobación, la
// pantalla ofrecía un formulario condenado a fallar. Con la escritura en el
// backend (`service_role`, que sí aplica las reglas) esa prueba sobra: **se puede
// escribir siempre que el usuario tenga ficha de colaborador**, y es la propia API
// la que lo dice —`403 NO_ES_COLABORADOR`— si no la tiene.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ApiSuccess } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { aISODate } from '../../lib/format';
import type { MetaFila, MetaPeriodo, MetaTipo } from './metaAvance';
import { elegirMetaDelDia } from './metaAvance';

// El nombre se reexporta para quien lo busque en el módulo de metas: es la regla
// que decide cuál manda hoy y se usa desde aquí (`useMetaDelDia`).
export { elegirMetaDelDia };

export const metasKeys = {
  /** Raíz: invalida la lista y la meta del día a la vez. */
  todas: ['metas'] as const,
  delColaborador: (colaboradorId: number | null) =>
    ['metas', 'colaborador', colaboradorId] as const,
};

/**
 * Respuesta de `GET /me/metas`.
 *
 * `propias` son las personales del usuario; `empresa`, las de
 * `origen = administracion` que puede ver (las del spa y las que administración le
 * asignó). El backend **no manda** las metas personales de otras personas: el
 * filtro por dueño se aplica en la consulta.
 */
interface MetasDelUsuario {
  propias: MetaFila[];
  empresa: MetaFila[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las metas que le corresponden al colaborador: **las suyas** y las del negocio.
 *
 * Se devuelven en una sola lista (primero las propias) porque es lo que consumen
 * las dos pantallas del portal: `MisMetasPage` las separa por `colaborador_id` y
 * `elegirMetaDelDia` elige entre todas.
 *
 * `colaboradorId` se sigue exponiendo para que la pantalla pueda distinguir
 * «todavía no sé si tengo ficha» de «no tengo metas» sin volver a leer el store.
 */
export function useMetasDelColaborador() {
  const colaboradorId = useAuthStore((s) => s.user?.colaborador_id ?? null);

  const consulta = useQuery({
    queryKey: metasKeys.delColaborador(colaboradorId),
    staleTime: 30_000,
    queryFn: async (): Promise<MetaFila[]> => {
      // Sin ficha de colaborador la consulta también vale: el backend responde
      // `propias: []` con las de empresa, en vez de un error. Así el colaborador
      // que aún no está vinculado ve las metas del negocio igual que los demás.
      const res = await api.get<unknown, ApiSuccess<MetasDelUsuario>>('/me/metas');
      const { propias = [], empresa = [] } = res.data ?? {};
      return [...propias, ...empresa];
    },
  });

  return { ...consulta, colaboradorId };
}

/**
 * La meta del día que manda en `/app`, más el estado de la consulta.
 *
 * `cargando` es `false` cuando el usuario no tiene ficha de colaborador: si no,
 * el resumen se quedaría con un esqueleto permanente en vez de decir que no hay
 * meta.
 */
export function useMetaDelDia() {
  const { data, isPending, isError, error, colaboradorId } = useMetasDelColaborador();

  return {
    meta: elegirMetaDelDia(data ?? [], colaboradorId, aISODate(new Date())),
    cargando: colaboradorId !== null && isPending,
    error: isError ? error : null,
    /** `false` ⇒ no se puede guardar una meta personal: no se invita a crearla. */
    puedeDefinir: colaboradorId !== null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura (metas personales)
// ─────────────────────────────────────────────────────────────────────────────

export interface MetaInput {
  tipo: MetaTipo;
  periodo: MetaPeriodo;
  /** **Pesos enteros** (`numeric(14,0)`). */
  objetivo: number;
  vigenteDesde: string;
  /** `null` = sin fecha de fin. */
  vigenteHasta: string | null;
}

/**
 * Campos que el portal puede cambiar en una meta personal.
 *
 * ⛔ `origen`, `bono`, `colaborador_id`, `tenant_id` y `creada_por` **no** están
 * aquí, y tampoco en el DTO del backend: el origen lo fuerza el servidor
 * (`personal`), el `tenant_id` sale del perfil, el `colaborador_id` y el
 * `creada_por` de la sesión, y el `bono` no existe en las personales —el `CHECK`
 * `metas_bono_solo_administracion` lo rechaza, porque una meta personal es una
 * intención, no un contrato—. Mandarlos responde `400` (el backend valida con
 * `forbidNonWhitelisted`).
 */
export type CambiosMeta = Partial<MetaInput> & { activa?: boolean };

/**
 * Traduce a las claves que espera la API, incluyendo **sólo** lo que se quiere
 * cambiar (`undefined` se descarta: enviar una clave de más es un `400`).
 *
 * `objetivo` se redondea: es `numeric(14,0)` y el peso colombiano no tiene
 * centavos, así que un `45550.4` guardado como `45550` es lo correcto — y el
 * formulario ya enseña el importe redondeado antes de guardarlo—.
 */
function aColumnas(cambios: CambiosMeta): Record<string, unknown> {
  const fila: Record<string, unknown> = {};
  if (cambios.tipo !== undefined) fila.tipo = cambios.tipo;
  if (cambios.periodo !== undefined) fila.periodo = cambios.periodo;
  if (cambios.objetivo !== undefined) fila.objetivo = Math.round(cambios.objetivo);
  if (cambios.vigenteDesde !== undefined) fila.vigente_desde = cambios.vigenteDesde;
  if (cambios.vigenteHasta !== undefined) fila.vigente_hasta = cambios.vigenteHasta;
  if (cambios.activa !== undefined) fila.activa = cambios.activa;
  return fila;
}

/**
 * `POST /me/metas` — crea una meta **personal**.
 *
 * El cuerpo no lleva `origen`, `colaborador_id` ni `creada_por`: los pone el
 * servidor desde la sesión. Si el usuario no tiene ficha de colaborador, la API
 * responde `403 NO_ES_COLABORADOR` con un mensaje que se puede enseñar tal cual.
 */
async function crearMetaPersonal(input: MetaInput): Promise<MetaFila> {
  const res = await api.post<unknown, ApiSuccess<MetaFila>>(
    '/me/metas',
    aColumnas(input),
  );
  return res.data;
}

/**
 * `PATCH /me/metas/:id` — edita una meta personal **propia**.
 *
 * Si la meta no es suya, no es personal o no existe, la API responde
 * `404 NOT_FOUND` (a propósito: no revela si el identificador existe).
 */
async function actualizarMeta(id: number, cambios: CambiosMeta): Promise<MetaFila> {
  const res = await api.patch<unknown, ApiSuccess<MetaFila>>(
    `/me/metas/${id}`,
    aColumnas(cambios),
  );
  return res.data;
}

/** `DELETE /me/metas/:id` — borra una meta personal **propia**. */
async function borrarMeta(id: number): Promise<void> {
  await api.delete<unknown, ApiSuccess<{ id: number; borrada: boolean }>>(`/me/metas/${id}`);
}

export function useCrearMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: crearMetaPersonal,
    onSuccess: () => qc.invalidateQueries({ queryKey: metasKeys.todas }),
  });
}

export function useActualizarMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: CambiosMeta }) =>
      actualizarMeta(id, cambios),
    onSuccess: () => qc.invalidateQueries({ queryKey: metasKeys.todas }),
  });
}

export function useBorrarMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: borrarMeta,
    onSuccess: () => qc.invalidateQueries({ queryKey: metasKeys.todas }),
  });
}

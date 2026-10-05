// src/pages/AuditoriaPage.tsx
//
// Auditoría del sistema — **sólo administración**: el control de rol vive en
// `App.tsx` (`RequireRole`), aquí no se repite.
//
// Contrato real (`src/services/auditoria.service.ts`): la tabla `auditoria`
// **no tiene columna `tabla`**; se filtra por `modulo` y `accion`, que son un
// vocabulario cerrado en MAYÚSCULAS. Por eso los filtros son `<select>`: un typo
// devolvía una lista vacía sin explicar por qué.
//
// El listado se carga con TanStack Query (`useQuery`): los filtros forman parte
// de la `queryKey`, así que no hay closure obsoleto ni `setState` dentro de un
// `useEffect`.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Database,
  Filter,
  Lock,
  LockOpen,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  AuditoriaService,
  LIMITE_AUDITORIA,
  type AuditoriaFiltros,
} from '../services/auditoria.service';
import { PageHeader } from '../components/PageHeader';
import { UsuariosService } from '../services/usuarios.service';
import { formatFechaHora, formatNumero } from '../lib/format';
import { claseBadge, claseBanner, metaEstado, type EstadoMeta, type Tono } from '../lib/estados';

// ---------------------------------------------------------------------------
// Vocabulario de auditoría
// ---------------------------------------------------------------------------
/** Lista blanca de `registrar_auditoria` (módulos). */
const MODULOS = [
  'VENTAS',
  'CAJAS',
  'INVENTARIO',
  'CATALOGO',
  'CLIENTES',
  'COLABORADORES',
  'USUARIOS',
  'LIQUIDACIONES',
  'CUENTAS',
  'PRODUCTOS',
  'SERVICIOS',
  'PROMOCIONES',
  'AUDITORIA',
  'COMANDAS',
  'FINANZAS',
  'PAGOS',
  'SISTEMA',
  'CONFIGURACION',
  'CREDITOS',
] as const;

/** Lista blanca de `registrar_auditoria` (acciones). */
const ACCIONES = [
  'CREAR',
  'ACTUALIZAR',
  'ELIMINAR',
  'ANULAR',
  'PAGAR',
  'ABRIR',
  'CERRAR',
  'LOGIN',
  'LOGOUT',
  'APROBAR',
] as const;

/**
 * `src/lib/estados.ts` no tiene mapa de acciones (no son estados de una fila,
 * sino verbos de auditoría): se define aquí, local a la página.
 */
const ACCION_META: Record<string, EstadoMeta> = {
  CREAR: { label: 'Crear', tono: 'success', icono: 'Plus' },
  ACTUALIZAR: { label: 'Actualizar', tono: 'info', icono: 'Pencil' },
  ELIMINAR: { label: 'Eliminar', tono: 'danger', icono: 'Trash2' },
  ANULAR: { label: 'Anular', tono: 'danger', icono: 'Ban' },
  PAGAR: { label: 'Pagar', tono: 'accent', icono: 'Banknote' },
  ABRIR: { label: 'Abrir', tono: 'success', icono: 'LockOpen' },
  CERRAR: { label: 'Cerrar', tono: 'neutral', icono: 'Lock' },
  LOGIN: { label: 'Inicio de sesión', tono: 'neutral', icono: 'LogIn' },
  LOGOUT: { label: 'Cierre de sesión', tono: 'neutral', icono: 'LogOut' },
  APROBAR: { label: 'Aprobar', tono: 'success', icono: 'ThumbsUp' },
};

/** `EstadoMeta.icono` es un string: aquí se resuelve a componente de lucide. */
const ICONOS_ACCION: Record<string, LucideIcon> = {
  Plus,
  Pencil,
  Trash2,
  Ban,
  Banknote,
  LockOpen,
  Lock,
  LogIn,
  LogOut,
  ThumbsUp,
};

/** Tono del badge de módulo (sólo agrupa visualmente; el texto siempre va). */
const TONO_MODULO: Record<string, Tono> = {
  VENTAS: 'success',
  PAGOS: 'success',
  CAJAS: 'accent',
  FINANZAS: 'accent',
  PROMOCIONES: 'accent',
  INVENTARIO: 'info',
  PRODUCTOS: 'info',
  SERVICIOS: 'info',
  CATALOGO: 'info',
  CLIENTES: 'info',
  COLABORADORES: 'info',
  COMANDAS: 'info',
  USUARIOS: 'warning',
  LIQUIDACIONES: 'warning',
  CUENTAS: 'warning',
  CREDITOS: 'warning',
  SISTEMA: 'danger',
  CONFIGURACION: 'danger',
};

// ---------------------------------------------------------------------------
// Utilidades locales
// ---------------------------------------------------------------------------
type LineaDiff = { campo: string; antes: string; despues: string };

function formatearValor(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

/**
 * Campos que cambian entre `datos_anteriores` y `datos_nuevos`.
 * En un alta (`datos_anteriores = null`) todos los campos salen como nuevos.
 */
function construirDiff(
  anteriores: Record<string, unknown> | null,
  nuevos: Record<string, unknown> | null,
): LineaDiff[] {
  const campos = new Set([...Object.keys(anteriores ?? {}), ...Object.keys(nuevos ?? {})]);
  const lineas: LineaDiff[] = [];
  for (const campo of campos) {
    const antes = anteriores?.[campo];
    const despues = nuevos?.[campo];
    if (JSON.stringify(antes) === JSON.stringify(despues)) continue;
    lineas.push({ campo, antes: formatearValor(antes), despues: formatearValor(despues) });
  }
  return lineas;
}

/**
 * `input type="date"` da `YYYY-MM-DD`, pero el DTO compara contra `fecha_hora`
 * (timestamptz) y espera ISO 8601. Se construye el instante en la zona del
 * navegador para que el día completo quede dentro del rango.
 */
function aInicioDelDia(fecha: string): string | undefined {
  if (!fecha) return undefined;
  const d = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function aFinDelDia(fecha: string): string | undefined {
  if (!fecha) return undefined;
  const d = new Date(`${fecha}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function mensajeError(err: unknown): string {
  const e = err as { error?: string; message?: string } | null;
  if (e?.error === 'VALIDATION_ERROR') {
    return e.message ?? 'Revisa los filtros: módulo, acción, usuario y rango de fechas.';
  }
  return e?.message ?? 'No se pudieron cargar los registros de auditoría.';
}

/** Acción con **ícono + texto** (nunca sólo color). */
function BadgeAccion({ accion }: { accion: string }) {
  const meta = metaEstado(ACCION_META, accion);
  const Icono = (meta.icono ? ICONOS_ACCION[meta.icono] : undefined) ?? CircleAlert;
  return (
    <span className={claseBadge(meta.tono)}>
      <Icono size={12} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
const AuditoriaPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [modulo, setModulo] = useState('');
  const [accion, setAccion] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const usuarioNum = Number(usuarioId);
  const usuarioFiltro = Number.isInteger(usuarioNum) && usuarioNum > 0 ? usuarioNum : undefined;

  const filtros: AuditoriaFiltros = {
    page,
    limit: LIMITE_AUDITORIA,
    modulo: modulo || undefined,
    accion: accion || undefined,
    usuario_id: usuarioFiltro,
    fecha_desde: aInicioDelDia(fechaDesde),
    fecha_hasta: aFinDelDia(fechaHasta),
  };

  const consulta = useQuery({
    queryKey: ['auditoria', filtros],
    queryFn: () => AuditoriaService.getLogs(filtros),
    // Mantiene la página anterior mientras llega la nueva: sin parpadeo.
    placeholderData: (prev) => prev,
  });

  const logs = consulta.data?.data ?? [];

  // Nombres de usuario para el filtro y la tabla (antes sólo se veía «#1»).
  const usuariosQ = useQuery({
    queryKey: ['usuarios', 'auditoria'],
    queryFn: () => UsuariosService.listar({ limit: 100 }),
    staleTime: 5 * 60_000,
  });
  const nombreUsuario = new Map(
    (usuariosQ.data?.data ?? []).map((u) => [Number(u.id), u.nombre] as const),
  );
  const hayIp = logs.some((l) => !!l.ip_address);
  const meta = consulta.data?.meta;
  const hayFiltros = Boolean(modulo || accion || usuarioId || fechaDesde || fechaHasta);

  const limpiarFiltros = () => {
    setModulo('');
    setAccion('');
    setUsuarioId('');
    setFechaDesde('');
    setFechaHasta('');
    setPage(1);
  };

  return (
    <div className="page-container space-y-6">
      {/* Encabezado */}
      <PageHeader
        titulo="Auditoría del sistema"
        descripcion={
          <>
            Registro de operaciones: quién hizo qué, en qué módulo y cuándo.{' '}
            {formatNumero(meta?.total ?? 0)} {meta?.total === 1 ? 'evento' : 'eventos'} en total.
          </>
        }
        icono={ShieldCheck}
        acciones={
          <button
            type="button"
            className="btn-secondary flex items-center gap-2 text-xs"
            onClick={() => void consulta.refetch()}
            disabled={consulta.isFetching}
            aria-label="Actualizar los registros de auditoría"
          >
            <RefreshCw
              size={14}
              className={consulta.isFetching ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            Actualizar
          </button>
        }
      />

      {/* Filtros */}
      <div className="panel space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-h2 text-text-primary">
          <Filter size={18} aria-hidden="true" /> Filtrar eventos
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="filtro-modulo" className="label">
              Módulo
            </label>
            <select
              id="filtro-modulo"
              className="select"
              value={modulo}
              onChange={(e) => {
                setModulo(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los módulos</option>
              {MODULOS.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filtro-accion" className="label">
              Acción
            </label>
            <select
              id="filtro-accion"
              className="select"
              value={accion}
              onChange={(e) => {
                setAccion(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas las acciones</option>
              {ACCIONES.map((valor) => (
                <option key={valor} value={valor}>
                  {metaEstado(ACCION_META, valor).label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filtro-usuario" className="label">
              Usuario
            </label>
            <select
              id="filtro-usuario"
              className="select"
              value={usuarioId}
              onChange={(e) => {
                setUsuarioId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {(usuariosQ.data?.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filtro-desde" className="label">
              Desde
            </label>
            <input
              id="filtro-desde"
              className="input"
              type="date"
              value={fechaDesde}
              max={fechaHasta || undefined}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <label htmlFor="filtro-hasta" className="label">
              Hasta
            </label>
            <input
              id="filtro-hasta"
              className="input"
              type="date"
              value={fechaHasta}
              min={fechaDesde || undefined}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={limpiarFiltros}
            disabled={!hayFiltros && page === 1}
          >
            Limpiar filtros
          </button>
          {consulta.isFetching && !consulta.isLoading && (
            <span className="text-body-sm text-text-muted">Actualizando…</span>
          )}
        </div>
      </div>

      {/* Error de la API */}
      {Boolean(consulta.error) && (
        <div className={claseBanner('danger')} role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>{mensajeError(consulta.error)}</span>
        </div>
      )}

      {/* Tabla */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Fecha y hora</th>
                <th scope="col">Módulo</th>
                <th scope="col">Acción</th>
                <th scope="col">Descripción</th>
                <th scope="col">Usuario</th>
                {hayIp && <th scope="col">IP</th>}
              </tr>
            </thead>
            <tbody>
              {consulta.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td colSpan={hayIp ? 6 : 5} className="p-4">
                      <div className="skeleton h-4 w-full" />
                    </td>
                  </tr>
                ))}

              {!consulta.isLoading &&
                logs.map((log) => {
                  const diff = construirDiff(log.datos_anteriores, log.datos_nuevos);
                  return (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap">
                        <span className="flex items-center gap-1.5 text-text-secondary">
                          <Clock size={12} aria-hidden="true" />
                          {formatFechaHora(log.fecha_hora)}
                        </span>
                      </td>
                      <td>
                        <span className={claseBadge(TONO_MODULO[log.modulo] ?? 'neutral')}>
                          <Database size={12} aria-hidden="true" />
                          {log.modulo}
                        </span>
                      </td>
                      <td>
                        <BadgeAccion accion={log.accion} />
                      </td>
                      <td className="max-w-md">
                        <span className="block text-text-secondary">{log.descripcion || '—'}</span>
                        {log.registro_id !== null && (
                          <span className="mt-0.5 block text-body-sm text-text-muted">
                            Registro #{log.registro_id}
                          </span>
                        )}
                        {diff.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-body-sm text-accent-from">
                              Ver cambios ({diff.length})
                            </summary>
                            <pre className="mt-1 max-w-md overflow-x-auto rounded-sm border border-border-subtle bg-bg-elevated p-2 text-body-sm">
                              {diff.map((linea) => (
                                <span key={linea.campo} className="block">
                                  <span className="text-text-muted">{linea.campo}: </span>
                                  <span className="text-danger">{linea.antes}</span>
                                  <span className="text-text-muted"> → </span>
                                  <span className="text-success">{linea.despues}</span>
                                </span>
                              ))}
                            </pre>
                          </details>
                        )}
                      </td>
                      <td className="text-text-secondary">
                        {log.usuario_id !== null ? (
                          <span className="flex items-center gap-1.5">
                            <User size={12} aria-hidden="true" />
                            {nombreUsuario.get(Number(log.usuario_id)) ?? `#${log.usuario_id}`}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      {hayIp && <td className="text-text-muted">{log.ip_address ?? '—'}</td>}
                    </tr>
                  );
                })}

              {!consulta.isLoading && logs.length === 0 && (
                <tr>
                  <td colSpan={hayIp ? 6 : 5} className="p-10 text-center">
                    {hayFiltros ? (
                      <>
                        <p className="text-body text-text-secondary">
                          No hay eventos que coincidan con los filtros.
                        </p>
                        <p className="mt-1 text-body-sm text-text-muted">
                          Prueba con otro módulo, otra acción o un rango de fechas más amplio. Un
                          valor que no existe en el vocabulario devuelve la lista vacía.
                        </p>
                        <button
                          type="button"
                          className="btn-ghost mt-2 text-xs"
                          onClick={limpiarFiltros}
                        >
                          Limpiar filtros
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-body text-text-secondary">
                          Aún no hay eventos registrados.
                        </p>
                        <p className="mt-1 text-body-sm text-text-muted">
                          La auditoría se activó recientemente; las operaciones nuevas aparecerán
                          aquí.
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación real con `meta` */}
        <div className="flex items-center justify-between border-t border-border-subtle p-4 text-body-sm text-text-secondary">
          <span className="tabular">
            Página {formatNumero(meta?.page ?? 1)} de{' '}
            {formatNumero(Math.max(1, meta?.totalPages ?? 1))} · {formatNumero(meta?.total ?? 0)}{' '}
            {meta?.total === 1 ? 'evento' : 'eventos'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary flex items-center gap-1 text-xs"
              disabled={page <= 1 || consulta.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} aria-hidden="true" /> Anterior
            </button>
            <button
              type="button"
              className="btn-secondary flex items-center gap-1 text-xs"
              disabled={!meta || page >= meta.totalPages || consulta.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditoriaPage;

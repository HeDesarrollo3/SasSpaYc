// src/pages/InventoryPage.tsx
//
// Catálogo e inventario — dos pestañas (Servicios · Productos) sobre
// `src/services/catalog.service.ts`, que habla el contrato **real** del backend.
//
// Contrato verificado (docs/03-ESQUEMA-VERIFICADO.md §1.2):
//   · `servicios` → id, categoria, nombre_servicio, precio, costo_insumo,
//                   porcentaje_colaborador, activo, created_at, updated_at
//   · `productos` → id, nombre_producto, precio_venta, costo_compra, stock_actual
//                   (+ activo, categoria, stock_minimo, codigo_barras,
//                      comisionable, porcentaje_colaborador con la migración 004)
//
// ⚠️ La migración 004 (campos de catálogo) todavía NO está aplicada. Los filtros
//    `activo`/`categoria` de productos, los campos avanzados de su edición y
//    `duracion_minutos`/`comision_sobre` en servicios responden
//    `500 INTERNAL_ERROR` (PostgREST `42703`). Cuando ocurre, la pantalla lo dice
//    explícitamente en un `.banner-warning` en lugar de mostrar un error genérico,
//    y esos campos sólo se envían si el usuario los modifica.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  AlertTriangle,
  Loader2,
  Package,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

import { CatalogoService, type Producto, type Servicio } from '../services/catalog.service';
import type { ApiError } from '../services/api';
import { formatMoney, formatNumero, formatPorcentaje } from '../lib/format';
import { claseBadge, claseBanner } from '../lib/estados';
import { PageHeader } from '../components/PageHeader';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const CLAVE_CATALOGO = 'catalogo';
const LIMIT = 15;
const DEBOUNCE_MS = 300;

// ⚠️ Antes decía: «Este filtro requiere aplicar la migración 004 (campos de
// catálogo)». Es **literalmente el ejemplo de texto técnico que la propia
// especificación del producto pone como malo**: habla de una migración a alguien
// que sólo quiere filtrar productos. Lo accionable es avisar a quien administra.
const MENSAJE_MIGRACION_004 =
  'Este filtro aún no está disponible. Avisa a administración para que lo activen.';

type Pestana = 'servicios' | 'productos';
type EstadoFiltro = 'todos' | 'activos' | 'inactivos';

/** Baja lógica pendiente de confirmar (mismo modal para las dos pestañas). */
type BajaCatalogo =
  { tipo: 'producto'; producto: Producto } | { tipo: 'servicio'; servicio: Servicio };

// ---------------------------------------------------------------------------
// Helpers de error de la API
// ---------------------------------------------------------------------------
function esErrorApi(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && 'message' in err;
}

/** Mensaje de la API tal cual llega (o el genérico de red). */
function mensajeApi(err: unknown): string {
  return esErrorApi(err) ? err.message : 'Error de conexión con el servidor';
}

/**
 * `500 INTERNAL_ERROR` es lo que el backend devuelve cuando PostgREST responde
 * `42703` (columna inexistente) → en productos, casi siempre la migración 004.
 */
function esEsquemaSinMigrar(err: unknown): boolean {
  return esErrorApi(err) && err.statusCode === 500 && err.error === 'INTERNAL_ERROR';
}

interface BannerErrorProps {
  error: unknown;
  /** Cuando el error es atribuible a la migración 004 pendiente. */
  contexto004?: boolean;
  className?: string;
}

function BannerError({ error, contexto004 = false, className }: BannerErrorProps) {
  if (!error) return null;

  if (contexto004 && esEsquemaSinMigrar(error)) {
    return (
      <div className={`${claseBanner('warning')} ${className ?? ''}`} role="alert">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">{MENSAJE_MIGRACION_004}</p>
          <p className="mt-1 opacity-90">{mensajeApi(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${claseBanner('danger')} ${className ?? ''}`} role="alert">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{mensajeApi(error)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilidades de formulario
// ---------------------------------------------------------------------------
const aNumero = (valor: string): number | undefined =>
  valor.trim() === '' ? undefined : Number(valor);

/** Esc cierra el drawer / el modal (regla del design system). */
function useCerrarConEsc(activo: boolean, cerrar: () => void) {
  useEffect(() => {
    if (!activo) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [activo, cerrar]);
}

function useDebounce(valor: string, ms: number): string {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(valor), ms);
    return () => window.clearTimeout(id);
  }, [valor, ms]);
  return debounced;
}

interface Filtros {
  q: string;
  categoria: string;
  estado: EstadoFiltro;
  page: number;
}

const FILTROS_INICIALES: Filtros = {
  q: '',
  categoria: '',
  estado: 'todos',
  page: 1,
};

/**
 * Estado de filtros + debounce de la búsqueda, uno por pestaña.
 * La página vuelve a 1 en cuanto cambia cualquier criterio.
 */
function useFiltrosCatalogo() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const q = useDebounce(filtros.q, DEBOUNCE_MS);

  const cambiar = useCallback((parcial: Partial<Omit<Filtros, 'page'>>) => {
    setFiltros((previos) => ({ ...previos, ...parcial, page: 1 }));
  }, []);

  const irAPagina = useCallback((page: number) => {
    setFiltros((previos) => ({ ...previos, page }));
  }, []);

  const limpiar = useCallback(() => setFiltros(FILTROS_INICIALES), []);

  const consulta = useMemo(
    () => ({
      q,
      categoria: filtros.categoria,
      estado: filtros.estado,
      page: filtros.page,
    }),
    [q, filtros.categoria, filtros.estado, filtros.page],
  );

  const hayFiltros =
    filtros.q.trim() !== '' || filtros.categoria !== '' || filtros.estado !== 'todos';

  return { filtros, consulta, cambiar, irAPagina, limpiar, hayFiltros };
}

interface ConsultaCatalogo {
  q: string;
  categoria: string;
  estado: EstadoFiltro;
  page: number;
}

function aParametros(consulta: ConsultaCatalogo) {
  return {
    q: consulta.q.trim() || undefined,
    categoria: consulta.categoria || undefined,
    activo: consulta.estado === 'todos' ? undefined : consulta.estado === 'activos',
    page: consulta.page,
    limit: LIMIT,
  };
}

/**
 * Categorías sugeridas para el filtro.
 *
 * El backend no expone un endpoint de categorías (`servicios.categoria` es texto
 * libre), así que se sugieren las de la página cargada en lugar de inventar una
 * lista. El valor seleccionado siempre se mantiene como opción.
 */
function categoriasDe(filas: ReadonlyArray<{ categoria?: string | null }>): string[] {
  const conjunto = new Set<string>();
  filas.forEach((fila) => {
    const categoria = fila.categoria;
    if (typeof categoria === 'string' && categoria.trim() !== '') conjunto.add(categoria);
  });
  return [...conjunto].sort((a, b) => a.localeCompare(b, 'es'));
}

// ---------------------------------------------------------------------------
// Esquemas de validación (cliente)
// ---------------------------------------------------------------------------
const textoObligatorio = (mensaje: string) =>
  z.string().refine((valor) => valor.trim().length > 0, mensaje);

const importeObligatorio = (etiqueta: string) =>
  z
    .string()
    .refine((valor) => valor.trim() !== '', `${etiqueta} es obligatorio`)
    .refine(
      (valor) => Number.isFinite(Number(valor)) && Number(valor) >= 0,
      `${etiqueta} no puede ser negativo`,
    );

const importeOpcional = (etiqueta: string) =>
  z
    .string()
    .refine(
      (valor) => valor.trim() === '' || (Number.isFinite(Number(valor)) && Number(valor) >= 0),
      `${etiqueta} no puede ser negativo`,
    );

const enteroObligatorio = (etiqueta: string) =>
  z
    .string()
    .refine((valor) => valor.trim() !== '', `${etiqueta} es obligatorio`)
    .refine(
      (valor) => Number.isInteger(Number(valor)) && Number(valor) >= 0,
      `${etiqueta} debe ser un entero mayor o igual a 0`,
    );

const enteroOpcional = (etiqueta: string) =>
  z
    .string()
    .refine(
      (valor) => valor.trim() === '' || (Number.isInteger(Number(valor)) && Number(valor) >= 0),
      `${etiqueta} debe ser un entero mayor o igual a 0`,
    );

const porcentajeOpcional = (etiqueta: string) =>
  z
    .string()
    .refine(
      (valor) =>
        valor.trim() === '' ||
        (Number.isFinite(Number(valor)) && Number(valor) >= 0 && Number(valor) <= 100),
      `${etiqueta} debe estar entre 0 y 100`,
    );

const servicioSchema = z
  .object({
    categoria: textoObligatorio('La categoría es obligatoria'),
    nombreServicio: textoObligatorio('El nombre del servicio es obligatorio'),
    precio: importeObligatorio('El precio'),
    costoInsumo: importeOpcional('El costo de insumo'),
    porcentajeColaborador: porcentajeOpcional('El porcentaje del colaborador'),
    // Añadidos por la migración 004: sólo se envían si se modifican.
    duracionMinutos: enteroOpcional('La duración'),
    comisionSobre: z.literal('').or(z.literal('precio')).or(z.literal('precio_menos_insumo')),
    activo: z.boolean(),
    // Migración 024: precio variable (vacíos = precio fijo).
    precioMin: importeOpcional('El precio mínimo'),
    precioMax: importeOpcional('El precio máximo'),
  })
  .refine((v) => (v.precioMin === '') === (v.precioMax === ''), {
    message: 'Indica el mínimo y el máximo, o deja los dos vacíos',
    path: ['precioMax'],
  })
  .refine((v) => v.precioMin === '' || Number(v.precioMax) >= Number(v.precioMin), {
    message: 'El máximo no puede ser menor que el mínimo',
    path: ['precioMax'],
  });

type ServicioForm = z.infer<typeof servicioSchema>;

/** `servicios` todavía no declara estas columnas en el tipo (migración 004). */
type ServicioConCampos004 = Servicio & {
  duracion_minutos?: number | null;
  comision_sobre?: 'precio' | 'precio_menos_insumo' | null;
  precio_min?: number | null;
  precio_max?: number | null;
};

function valoresServicio(servicio: Servicio | null): ServicioForm {
  const extendido: ServicioConCampos004 | null = servicio;
  return {
    categoria: servicio?.categoria ?? '',
    nombreServicio: servicio?.nombre_servicio ?? '',
    precio: servicio ? String(servicio.precio) : '',
    costoInsumo: servicio?.costo_insumo != null ? String(servicio.costo_insumo) : '',
    porcentajeColaborador:
      servicio?.porcentaje_colaborador != null ? String(servicio.porcentaje_colaborador) : '',
    duracionMinutos: extendido?.duracion_minutos != null ? String(extendido.duracion_minutos) : '',
    comisionSobre: extendido?.comision_sobre ?? '',
    activo: servicio?.activo ?? true,
    precioMin: extendido?.precio_min != null ? String(extendido.precio_min) : '',
    precioMax: extendido?.precio_max != null ? String(extendido.precio_max) : '',
  };
}

type CambiosServicio = Parameters<typeof CatalogoService.actualizarServicio>[1];

/**
 * Igual que en productos: sólo se envían los campos que cambiaron, para que
 * `duracion_minutos`/`comision_sobre` (migración 004) no rompan una edición que
 * sólo pretendía corregir el precio.
 */
function diferenciasServicio(original: ServicioForm, valores: ServicioForm): CambiosServicio {
  const cambios: CambiosServicio = {};

  const nombre = valores.nombreServicio.trim();
  if (nombre !== original.nombreServicio.trim()) cambios.nombreServicio = nombre;
  if (valores.categoria.trim() !== original.categoria.trim())
    cambios.categoria = valores.categoria.trim();
  if (valores.precio !== original.precio) cambios.precio = Number(valores.precio);
  if (valores.costoInsumo !== original.costoInsumo)
    cambios.costoInsumo = aNumero(valores.costoInsumo);
  if (valores.porcentajeColaborador !== original.porcentajeColaborador)
    cambios.porcentajeColaborador = aNumero(valores.porcentajeColaborador);
  if (valores.duracionMinutos !== original.duracionMinutos)
    cambios.duracionMinutos = aNumero(valores.duracionMinutos);
  if (valores.comisionSobre !== original.comisionSobre && valores.comisionSobre !== '')
    cambios.comisionSobre = valores.comisionSobre;
  if (valores.activo !== original.activo) cambios.activo = valores.activo;
  if (valores.precioMin !== original.precioMin || valores.precioMax !== original.precioMax) {
    cambios.precioMin = valores.precioMin === '' ? null : Number(valores.precioMin);
    cambios.precioMax = valores.precioMax === '' ? null : Number(valores.precioMax);
  }

  return cambios;
}

const productoSchema = z.object({
  nombreProducto: textoObligatorio('El nombre del producto es obligatorio'),
  precioVenta: importeObligatorio('El precio de venta'),
  costoCompra: importeOpcional('El costo de compra'),
  stockActual: enteroObligatorio('El stock'),
  stockMinimo: enteroOpcional('El stock mínimo'),
  categoria: z.string(),
  codigoBarras: z.string(),
  comisionable: z.boolean(),
  porcentajeColaborador: porcentajeOpcional('El porcentaje del colaborador'),
  activo: z.boolean(),
});

type ProductoForm = z.infer<typeof productoSchema>;

function valoresProducto(producto: Producto | null): ProductoForm {
  return {
    nombreProducto: producto?.nombre_producto ?? '',
    precioVenta: producto ? String(producto.precio_venta) : '',
    costoCompra: producto?.costo_compra != null ? String(producto.costo_compra) : '',
    stockActual: producto ? String(producto.stock_actual) : '0',
    stockMinimo: producto?.stock_minimo != null ? String(producto.stock_minimo) : '',
    categoria: producto?.categoria ?? '',
    codigoBarras: producto?.codigo_barras ?? '',
    comisionable: producto?.comisionable ?? false,
    porcentajeColaborador:
      producto?.porcentaje_colaborador != null ? String(producto.porcentaje_colaborador) : '',
    activo: producto?.activo ?? true,
  };
}

type CambiosProducto = Parameters<typeof CatalogoService.actualizarProducto>[1];

/**
 * Sólo se envían los campos que **cambiaron**.
 *
 * Es importante: los campos que exige la migración 004 (`categoria`,
 * `stock_minimo`, `codigo_barras`, `comisionable`, `porcentaje_colaborador`,
 * `activo`) romperían un `PATCH` que sólo pretendía renombrar el producto.
 */
function diferenciasProducto(original: ProductoForm, valores: ProductoForm): CambiosProducto {
  const cambios: CambiosProducto = {};

  const nombre = valores.nombreProducto.trim();
  if (nombre !== original.nombreProducto.trim()) cambios.nombreProducto = nombre;
  if (valores.precioVenta !== original.precioVenta)
    cambios.precioVenta = Number(valores.precioVenta);
  if (valores.costoCompra !== original.costoCompra)
    cambios.costoCompra = aNumero(valores.costoCompra);
  if (valores.stockActual !== original.stockActual)
    cambios.stockActual = Number(valores.stockActual);
  if (valores.stockMinimo !== original.stockMinimo)
    cambios.stockMinimo = aNumero(valores.stockMinimo);
  if (valores.categoria.trim() !== original.categoria.trim())
    cambios.categoria = valores.categoria.trim();
  if (valores.codigoBarras.trim() !== original.codigoBarras.trim())
    cambios.codigoBarras = valores.codigoBarras.trim();
  if (valores.comisionable !== original.comisionable) cambios.comisionable = valores.comisionable;
  if (valores.porcentajeColaborador !== original.porcentajeColaborador)
    cambios.porcentajeColaborador = aNumero(valores.porcentajeColaborador);
  if (valores.activo !== original.activo) cambios.activo = valores.activo;

  return cambios;
}

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------
interface CampoProps {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  children: ReactNode;
}

function Campo({ id, etiqueta, error, ayuda, children }: CampoProps) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {etiqueta}
      </label>
      {children}
      {ayuda && !error && <p className="field-help">{ayuda}</p>}
      {error && (
        <p className="field-error" role="alert">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
    </div>
  );
}

const ANCHOS_SKELETON = ['w-40', 'w-24', 'w-16', 'w-20', 'w-16', 'w-16'];

function FilasFantasma({ columnas }: { columnas: number }) {
  return (
    <>
      {Array.from({ length: LIMIT }).map((_, indiceFila) => (
        <tr key={indiceFila}>
          {Array.from({ length: columnas }).map((__, indiceColumna) => (
            <td key={indiceColumna}>
              <div
                className={`skeleton h-4 ${ANCHOS_SKELETON[indiceColumna % ANCHOS_SKELETON.length]}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EstadoVacio({
  titulo,
  detalle,
  conFiltros,
  onLimpiar,
}: {
  titulo: string;
  detalle: string;
  conFiltros: boolean;
  onLimpiar: () => void;
}) {
  return (
    <div className="mx-auto max-w-md space-y-2 py-4">
      <Search size={26} className="mx-auto text-text-muted" />
      <p className="text-body font-semibold text-text-secondary">{titulo}</p>
      <p className="text-body-sm text-text-muted">{detalle}</p>
      {conFiltros && (
        <button type="button" className="btn-ghost mx-auto" onClick={onLimpiar}>
          <X size={14} /> Limpiar filtros
        </button>
      )}
    </div>
  );
}

interface Meta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function Paginador({
  meta,
  cantidad,
  onIr,
}: {
  meta: Meta;
  cantidad: number;
  onIr: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle p-4 text-body-sm text-text-secondary">
      <span className="tabular">
        Mostrando {formatNumero(cantidad)} de {formatNumero(meta.total)} · página{' '}
        {formatNumero(meta.page)} de {formatNumero(meta.totalPages)}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary px-3 py-1 text-xs"
          disabled={meta.page <= 1}
          onClick={() => onIr(meta.page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn-secondary px-3 py-1 text-xs"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onIr(meta.page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabla de servicios
// ---------------------------------------------------------------------------
function TablaServicios({
  filas,
  cargando,
  conFiltros,
  onLimpiar,
  onEditar,
  onDesactivar,
}: {
  filas: Servicio[];
  cargando: boolean;
  conFiltros: boolean;
  onLimpiar: () => void;
  onEditar: (servicio: Servicio) => void;
  onDesactivar: (servicio: Servicio) => void;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Categoría</th>
              <th className="num">Precio</th>
              <th className="num">Costo insumo</th>
              <th className="num">% colaborador</th>
              <th>Estado</th>
              <th className="num">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <FilasFantasma columnas={7} />}

            {!cargando &&
              filas.map((servicio) => (
                <tr key={servicio.id}>
                  <td className="strong">{servicio.nombre_servicio}</td>
                  <td>{servicio.categoria || '—'}</td>
                  <td className="num tabular font-semibold text-accent-from">
                    {formatMoney(servicio.precio)}
                  </td>
                  <td className="num tabular">
                    {servicio.costo_insumo === null ? '—' : formatMoney(servicio.costo_insumo)}
                  </td>
                  <td className="num tabular">
                    {servicio.porcentaje_colaborador === null
                      ? '—'
                      : formatPorcentaje(servicio.porcentaje_colaborador)}
                  </td>
                  <td>
                    <span className={claseBadge(servicio.activo ? 'success' : 'neutral')}>
                      {servicio.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => onEditar(servicio)}
                        title="Editar"
                        aria-label={`Editar ${servicio.nombre_servicio}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => onDesactivar(servicio)}
                        disabled={!servicio.activo}
                        title={servicio.activo ? 'Desactivar (baja lógica)' : 'Ya está desactivado'}
                        aria-label={`Desactivar ${servicio.nombre_servicio}`}
                      >
                        <Power size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center">
                  <EstadoVacio
                    titulo={
                      conFiltros
                        ? 'Ningún servicio coincide con los filtros'
                        : 'Aún no hay servicios en el catálogo'
                    }
                    detalle={
                      conFiltros
                        ? 'Prueba con otro nombre, otra categoría u otro estado.'
                        : 'Crea el primero con «Nuevo servicio»: aparecerá de inmediato en el POS.'
                    }
                    conFiltros={conFiltros}
                    onLimpiar={onLimpiar}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabla de productos
// ---------------------------------------------------------------------------
function TablaProductos({
  filas,
  cargando,
  conFiltros,
  onLimpiar,
  onEditar,
  onDesactivar,
}: {
  filas: Producto[];
  cargando: boolean;
  conFiltros: boolean;
  onLimpiar: () => void;
  onEditar: (producto: Producto) => void;
  onDesactivar: (producto: Producto) => void;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th className="num">Precio venta</th>
              <th className="num">Stock</th>
              <th className="num">Stock mín.</th>
              <th>Estado</th>
              <th className="num">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <FilasFantasma columnas={7} />}

            {!cargando &&
              filas.map((producto) => {
                // `stock_minimo` llega `undefined` hasta aplicar la migración 004:
                // la comparación se guarda para no marcar filas por accidente.
                const stockMinimo = producto.stock_minimo;
                const bajoMinimo =
                  typeof stockMinimo === 'number' && producto.stock_actual <= stockMinimo;

                return (
                  <tr key={producto.id}>
                    <td className="strong">{producto.nombre_producto}</td>
                    <td>{producto.categoria ?? '—'}</td>
                    <td className="num tabular font-semibold text-accent-from">
                      {formatMoney(producto.precio_venta)}
                    </td>
                    <td className="num">
                      <span
                        className={`tabular font-semibold ${
                          bajoMinimo ? 'text-warning' : 'text-text-primary'
                        }`}
                      >
                        {formatNumero(producto.stock_actual)}
                      </span>
                      {bajoMinimo && (
                        <span className={`${claseBadge('warning')} ml-2`}>
                          <AlertTriangle size={11} /> Bajo mínimo
                        </span>
                      )}
                    </td>
                    <td className="num tabular">
                      {typeof stockMinimo === 'number' ? formatNumero(stockMinimo) : '—'}
                    </td>
                    <td>
                      {producto.activo === undefined ? (
                        <span
                          className={claseBadge('neutral')}
                          title="Requiere la migración 004 (columna activo)"
                        >
                          Sin dato
                        </span>
                      ) : (
                        <span className={claseBadge(producto.activo ? 'success' : 'neutral')}>
                          {producto.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => onEditar(producto)}
                          aria-label={`Editar ${producto.nombre_producto}`}
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={() => onDesactivar(producto)}
                          disabled={producto.activo === false}
                          aria-label={`Desactivar ${producto.nombre_producto}`}
                          title={
                            producto.activo === false
                              ? 'Ya está desactivado'
                              : 'Desactivar (baja lógica)'
                          }
                        >
                          <Power size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center">
                  <EstadoVacio
                    titulo={
                      conFiltros
                        ? 'Ningún producto coincide con los filtros'
                        : 'Aún no hay productos registrados'
                    }
                    detalle={
                      conFiltros
                        ? 'Prueba con otro nombre, otra categoría u otro estado.'
                        : 'Crea el primero con «Nuevo producto»: aparecerá de inmediato en el POS.'
                    }
                    conFiltros={conFiltros}
                    onLimpiar={onLimpiar}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra de filtros
// ---------------------------------------------------------------------------
function BarraFiltros({
  idPrefijo,
  etiqueta,
  filtros,
  categorias,
  hayFiltros,
  onCambiar,
  onLimpiar,
}: {
  idPrefijo: string;
  etiqueta: string;
  filtros: Filtros;
  categorias: string[];
  hayFiltros: boolean;
  onCambiar: (parcial: Partial<Omit<Filtros, 'page'>>) => void;
  onLimpiar: () => void;
}) {
  const idBuscar = `${idPrefijo}-buscar`;
  const idCategoria = `${idPrefijo}-categoria`;
  const idEstado = `${idPrefijo}-estado`;

  return (
    <div className="panel grid grid-cols-1 items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_14rem_10rem_auto]">
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor={idBuscar} className="label">
          Buscar {etiqueta}
        </label>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            id={idBuscar}
            type="search"
            className="input pl-9"
            placeholder={`Nombre del ${etiqueta}…`}
            value={filtros.q}
            onChange={(evento) => onCambiar({ q: evento.target.value })}
          />
        </div>
      </div>

      <div>
        <label htmlFor={idCategoria} className="label">
          Categoría
        </label>
        <select
          id={idCategoria}
          className="select"
          value={filtros.categoria}
          onChange={(evento) => onCambiar({ categoria: evento.target.value })}
        >
          <option value="">Todas las categorías</option>
          {filtros.categoria !== '' && !categorias.includes(filtros.categoria) && (
            <option value={filtros.categoria}>{filtros.categoria}</option>
          )}
          {categorias.map((categoria) => (
            <option key={categoria} value={categoria}>
              {categoria}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={idEstado} className="label">
          Estado
        </label>
        <select
          id={idEstado}
          className="select"
          value={filtros.estado}
          onChange={(evento) => onCambiar({ estado: evento.target.value as EstadoFiltro })}
        >
          <option value="todos">Todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
      </div>

      <div className={`${hayFiltros ? 'flex' : 'hidden lg:flex'} sm:col-span-2 lg:col-span-1`}>
        <button
          type="button"
          className="btn-ghost"
          onClick={onLimpiar}
          disabled={!hayFiltros}
          aria-hidden={!hayFiltros}
          style={{ visibility: hayFiltros ? 'visible' : 'hidden' }}
        >
          <X size={15} /> Limpiar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer: nuevo / editar servicio
// ---------------------------------------------------------------------------
function DrawerServicio({
  servicio,
  categorias,
  onClose,
}: {
  servicio: Servicio | null;
  categorias: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const esEdicion = servicio !== null;
  const [errorApi, setErrorApi] = useState<unknown>(null);

  const original = useMemo(() => valoresServicio(servicio), [servicio]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ServicioForm>({
    resolver: zodResolver(servicioSchema),
    mode: 'onTouched',
    defaultValues: original,
  });

  useCerrarConEsc(true, onClose);

  const guardar = useMutation<
    { servicio_id: number; actualizado?: boolean },
    unknown,
    ServicioForm
  >({
    mutationFn: async (valores) => {
      if (!servicio) {
        const creado = await CatalogoService.crearServicio({
          categoria: valores.categoria.trim(),
          nombreServicio: valores.nombreServicio.trim(),
          precio: Number(valores.precio),
          costoInsumo: aNumero(valores.costoInsumo),
          porcentajeColaborador: aNumero(valores.porcentajeColaborador),
          activo: valores.activo,
        });
        // El alta (RPC) no conoce el rango: se guarda justo después.
        if (valores.precioMin !== '' && creado.servicio_id) {
          await CatalogoService.actualizarServicio(creado.servicio_id, {
            precioMin: Number(valores.precioMin),
            precioMax: Number(valores.precioMax),
          });
        }
        return creado;
      }
      const cambios = diferenciasServicio(original, valores);
      if (Object.keys(cambios).length === 0) {
        return { servicio_id: servicio.id, actualizado: false };
      }
      return CatalogoService.actualizarServicio(servicio.id, cambios);
    },
    onSuccess: (resultado) => {
      if (resultado.actualizado === false) {
        toast.info('No había cambios que guardar');
        onClose();
        return;
      }
      void qc.invalidateQueries({ queryKey: [CLAVE_CATALOGO] });
      toast.success(
        esEdicion ? 'Servicio actualizado correctamente' : 'Servicio creado correctamente',
      );
      onClose();
    },
    onError: (err) => {
      setErrorApi(err);
      toast.error(mensajeApi(err));
    },
  });

  const enviar = (valores: ServicioForm) => {
    setErrorApi(null);
    guardar.mutate(valores);
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-drawer-servicio"
      >
        <header className="drawer-header">
          <div>
            <h2 id="titulo-drawer-servicio" className="text-h2 text-text-primary">
              {esEdicion ? 'Editar servicio' : 'Nuevo servicio'}
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              {esEdicion
                ? 'Sólo se envían los campos que cambian.'
                : 'El servicio queda disponible en el POS en cuanto se guarda.'}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit(enviar)} className="flex min-h-0 flex-1 flex-col">
          <div className="drawer-body space-y-4">
            <BannerError error={errorApi} contexto004={esEdicion} />

            <Campo id="servicio-categoria" etiqueta="Categoría" error={errors.categoria?.message}>
              <input
                id="servicio-categoria"
                className="input"
                list="servicio-categorias-sugeridas"
                placeholder="Ej: Masajes"
                aria-invalid={errors.categoria ? true : undefined}
                {...register('categoria')}
              />
              <datalist id="servicio-categorias-sugeridas">
                {categorias.map((categoria) => (
                  <option key={categoria} value={categoria} />
                ))}
              </datalist>
            </Campo>

            <Campo
              id="servicio-nombre"
              etiqueta="Nombre del servicio"
              error={errors.nombreServicio?.message}
            >
              <input
                id="servicio-nombre"
                className="input"
                placeholder="Ej: Masaje relajante 60 min"
                aria-invalid={errors.nombreServicio ? true : undefined}
                {...register('nombreServicio')}
              />
            </Campo>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo
                id="servicio-precio"
                etiqueta="Precio"
                error={errors.precio?.message}
                ayuda={
                  esEdicion
                    ? 'Cambiar el precio no altera las comisiones ya liquidadas.'
                    : undefined
                }
              >
                <input
                  id="servicio-precio"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                  aria-invalid={errors.precio ? true : undefined}
                  {...register('precio')}
                />
              </Campo>

              <Campo
                id="servicio-costo"
                etiqueta="Costo de insumo"
                error={errors.costoInsumo?.message}
                ayuda="Opcional. Se usa para saber el margen real del servicio."
              >
                <input
                  id="servicio-costo"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                  aria-invalid={errors.costoInsumo ? true : undefined}
                  {...register('costoInsumo')}
                />
              </Campo>
            </div>

            <Campo
              id="servicio-porcentaje"
              etiqueta="% del colaborador"
              error={errors.porcentajeColaborador?.message}
              ayuda="Entre 0 y 100. Es la comisión que genera este servicio."
            >
              <input
                id="servicio-porcentaje"
                type="number"
                min="0"
                max="100"
                step="0.5"
                className="input"
                placeholder="40"
                aria-invalid={errors.porcentajeColaborador ? true : undefined}
                {...register('porcentajeColaborador')}
              />
            </Campo>

            {esEdicion && (
              <>
                <hr className="divider" />
                <div>
                  <h3 className="text-body font-semibold text-text-primary">Campos avanzados</h3>
                  <p className="field-help">
                    Opcionales. Ayudan a filtrar y a calcular comisiones.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo
                    id="servicio-precio-min"
                    etiqueta="Precio mínimo (si varía)"
                    error={errors.precioMin?.message}
                    ayuda="Ej.: cepillado según el largo. Vacío = precio fijo."
                  >
                    <input
                      id="servicio-precio-min"
                      inputMode="numeric"
                      className="input tabular"
                      aria-invalid={errors.precioMin ? true : undefined}
                      {...register('precioMin')}
                    />
                  </Campo>
                  <Campo
                    id="servicio-precio-max"
                    etiqueta="Precio máximo (si varía)"
                    error={errors.precioMax?.message}
                    ayuda="El colaborador elige el valor dentro del rango."
                  >
                    <input
                      id="servicio-precio-max"
                      inputMode="numeric"
                      className="input tabular"
                      aria-invalid={errors.precioMax ? true : undefined}
                      {...register('precioMax')}
                    />
                  </Campo>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo
                    id="servicio-duracion"
                    etiqueta="Duración (minutos)"
                    error={errors.duracionMinutos?.message}
                    ayuda="Entero mayor o igual a 0."
                  >
                    <input
                      id="servicio-duracion"
                      type="number"
                      min="0"
                      step="1"
                      className="input"
                      placeholder="60"
                      aria-invalid={errors.duracionMinutos ? true : undefined}
                      {...register('duracionMinutos')}
                    />
                  </Campo>

                  <Campo
                    id="servicio-comision-sobre"
                    etiqueta="Comisión sobre"
                    error={errors.comisionSobre?.message}
                  >
                    <select
                      id="servicio-comision-sobre"
                      className="select"
                      {...register('comisionSobre')}
                    >
                      <option value="">Sin definir</option>
                      <option value="precio">Precio completo</option>
                      <option value="precio_menos_insumo">Precio menos insumo</option>
                    </select>
                  </Campo>
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <input
                id="servicio-activo"
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-accent-from)]"
                {...register('activo')}
              />
              <label htmlFor="servicio-activo" className="text-body-sm text-text-secondary">
                Activo (visible en el POS)
              </label>
            </div>
          </div>

          <footer className="drawer-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={guardar.isPending}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={guardar.isPending}>
              {guardar.isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Guardando…
                </>
              ) : esEdicion ? (
                'Guardar cambios'
              ) : (
                'Crear servicio'
              )}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Drawer: nuevo / editar producto
// ---------------------------------------------------------------------------
function DrawerProducto({ producto, onClose }: { producto: Producto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const esEdicion = producto !== null;
  const [errorApi, setErrorApi] = useState<unknown>(null);

  const original = useMemo(() => valoresProducto(producto), [producto]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductoForm>({
    resolver: zodResolver(productoSchema),
    mode: 'onTouched',
    defaultValues: original,
  });

  useCerrarConEsc(true, onClose);

  const guardar = useMutation<
    { producto_id: number; actualizado?: boolean },
    unknown,
    ProductoForm
  >({
    mutationFn: async (valores) => {
      if (!producto) {
        return CatalogoService.crearProducto({
          nombreProducto: valores.nombreProducto.trim(),
          precioVenta: Number(valores.precioVenta),
          stockActual: Number(valores.stockActual),
          costoCompra: aNumero(valores.costoCompra),
        });
      }
      const cambios = diferenciasProducto(original, valores);
      if (Object.keys(cambios).length === 0) {
        return { producto_id: producto.id, actualizado: false };
      }
      return CatalogoService.actualizarProducto(producto.id, cambios);
    },
    onSuccess: (resultado) => {
      if (resultado.actualizado === false) {
        toast.info('No había cambios que guardar');
        onClose();
        return;
      }
      void qc.invalidateQueries({ queryKey: [CLAVE_CATALOGO] });
      toast.success(
        esEdicion ? 'Producto actualizado correctamente' : 'Producto creado correctamente',
      );
      onClose();
    },
    onError: (err) => {
      setErrorApi(err);
      toast.error(mensajeApi(err));
    },
  });

  const enviar = (valores: ProductoForm) => {
    setErrorApi(null);
    guardar.mutate(valores);
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-drawer-producto"
      >
        <header className="drawer-header">
          <div>
            <h2 id="titulo-drawer-producto" className="text-h2 text-text-primary">
              {esEdicion ? 'Editar producto' : 'Nuevo producto'}
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              {esEdicion
                ? 'Sólo se envían los campos que cambian.'
                : 'El stock inicial se registra con el alta del producto.'}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit(enviar)} className="flex min-h-0 flex-1 flex-col">
          <div className="drawer-body space-y-4">
            <BannerError error={errorApi} contexto004={esEdicion} />

            <Campo
              id="producto-nombre"
              etiqueta="Nombre del producto"
              error={errors.nombreProducto?.message}
            >
              <input
                id="producto-nombre"
                className="input"
                placeholder="Ej: Aceite de argán 100 ml"
                aria-invalid={errors.nombreProducto ? true : undefined}
                {...register('nombreProducto')}
              />
            </Campo>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo
                id="producto-precio"
                etiqueta="Precio de venta"
                error={errors.precioVenta?.message}
              >
                <input
                  id="producto-precio"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                  aria-invalid={errors.precioVenta ? true : undefined}
                  {...register('precioVenta')}
                />
              </Campo>

              <Campo
                id="producto-costo"
                etiqueta="Costo de compra"
                error={errors.costoCompra?.message}
                ayuda="Opcional."
              >
                <input
                  id="producto-costo"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                  aria-invalid={errors.costoCompra ? true : undefined}
                  {...register('costoCompra')}
                />
              </Campo>
            </div>

            <Campo
              id="producto-stock"
              etiqueta="Stock actual"
              error={errors.stockActual?.message}
              ayuda="Entero mayor o igual a 0."
            >
              <input
                id="producto-stock"
                type="number"
                min="0"
                step="1"
                className="input"
                aria-invalid={errors.stockActual ? true : undefined}
                {...register('stockActual')}
              />
            </Campo>

            {esEdicion && (
              <>
                <hr className="divider" />
                <div>
                  <h3 className="text-body font-semibold text-text-primary">Campos avanzados</h3>
                  <p className="field-help">
                    Opcionales. Ayudan a filtrar y a calcular comisiones.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo
                    id="producto-stock-minimo"
                    etiqueta="Stock mínimo"
                    error={errors.stockMinimo?.message}
                    ayuda="Umbral de alerta de stock bajo."
                  >
                    <input
                      id="producto-stock-minimo"
                      type="number"
                      min="0"
                      step="1"
                      className="input"
                      placeholder="0"
                      aria-invalid={errors.stockMinimo ? true : undefined}
                      {...register('stockMinimo')}
                    />
                  </Campo>

                  <Campo
                    id="producto-porcentaje"
                    etiqueta="% del colaborador"
                    error={errors.porcentajeColaborador?.message}
                    ayuda="Sólo se aplica si es comisionable."
                  >
                    <input
                      id="producto-porcentaje"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      className="input"
                      placeholder="0"
                      aria-invalid={errors.porcentajeColaborador ? true : undefined}
                      {...register('porcentajeColaborador')}
                    />
                  </Campo>

                  <Campo
                    id="producto-categoria"
                    etiqueta="Categoría"
                    error={errors.categoria?.message}
                  >
                    <input
                      id="producto-categoria"
                      className="input"
                      placeholder="Ej: Cuidado capilar"
                      {...register('categoria')}
                    />
                  </Campo>

                  <Campo
                    id="producto-codigo"
                    etiqueta="Código de barras"
                    error={errors.codigoBarras?.message}
                  >
                    <input
                      id="producto-codigo"
                      className="input"
                      placeholder="7501234567890"
                      {...register('codigoBarras')}
                    />
                  </Campo>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <input
                      id="producto-comisionable"
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-accent-from)]"
                      {...register('comisionable')}
                    />
                    <label
                      htmlFor="producto-comisionable"
                      className="text-body-sm text-text-secondary"
                    >
                      Comisionable
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="producto-activo"
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-accent-from)]"
                      {...register('activo')}
                    />
                    <label htmlFor="producto-activo" className="text-body-sm text-text-secondary">
                      Activo (visible en el POS)
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          <footer className="drawer-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={guardar.isPending}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={guardar.isPending}>
              {guardar.isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Guardando…
                </>
              ) : esEdicion ? (
                'Guardar cambios'
              ) : (
                'Crear producto'
              )}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Confirmación de baja lógica
// ---------------------------------------------------------------------------
function ModalDesactivar({
  tipo,
  nombre,
  detalle,
  pendiente,
  error,
  onCancelar,
  onConfirmar,
}: {
  tipo: 'producto' | 'servicio';
  nombre: string;
  detalle: string;
  pendiente: boolean;
  error: unknown;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  useCerrarConEsc(true, onCancelar);

  const tituloId = `titulo-desactivar-${tipo}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget && !pendiente) onCancelar();
      }}
    >
      <div
        className="panel w-full max-w-md p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={tituloId} className="text-h2 text-text-primary">
              Desactivar {tipo}
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              Es una baja lógica, no un borrado.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancelar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <p className="text-body text-text-secondary">
          ¿Desactivar <strong className="text-text-primary">{nombre}</strong>?
        </p>

        <div className={`${claseBanner('info')} mt-4`}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{detalle}</span>
        </div>

        <BannerError error={error} contexto004 className="mt-4" />

        <footer className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onCancelar} disabled={pendiente}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" onClick={onConfirmar} disabled={pendiente}>
            {pendiente ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Desactivando…
              </>
            ) : (
              `Desactivar ${tipo}`
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export function InventoryPage() {
  const qc = useQueryClient();

  const [pestana, setPestana] = useState<Pestana>('servicios');
  const filtrosServicios = useFiltrosCatalogo();
  const filtrosProductos = useFiltrosCatalogo();

  const [drawerServicio, setDrawerServicio] = useState<{
    abierto: boolean;
    servicio: Servicio | null;
  }>({ abierto: false, servicio: null });
  const [drawerProducto, setDrawerProducto] = useState<{
    abierto: boolean;
    producto: Producto | null;
  }>({ abierto: false, producto: null });
  const [baja, setBaja] = useState<BajaCatalogo | null>(null);

  const invalidar = useCallback(() => {
    void qc.invalidateQueries({ queryKey: [CLAVE_CATALOGO] });
  }, [qc]);

  const serviciosQuery = useQuery({
    queryKey: [CLAVE_CATALOGO, 'servicios', filtrosServicios.consulta],
    queryFn: () => CatalogoService.listarServicios(aParametros(filtrosServicios.consulta)),
    enabled: pestana === 'servicios',
    placeholderData: (previos) => previos, // mantiene la página anterior mientras carga
  });

  const productosQuery = useQuery({
    queryKey: [CLAVE_CATALOGO, 'productos', filtrosProductos.consulta],
    queryFn: () => CatalogoService.listarProductos(aParametros(filtrosProductos.consulta)),
    enabled: pestana === 'productos',
    placeholderData: (previos) => previos,
  });

  const filasServicios = useMemo(() => serviciosQuery.data?.data ?? [], [serviciosQuery.data]);
  const filasProductos = useMemo(() => productosQuery.data?.data ?? [], [productosQuery.data]);

  const categoriasServicios = useMemo(() => categoriasDe(filasServicios), [filasServicios]);
  const categoriasProductos = useMemo(() => categoriasDe(filasProductos), [filasProductos]);

  const desactivarProducto = useMutation<
    { producto_id: number; actualizado: boolean },
    unknown,
    number
  >({
    mutationFn: (id) => CatalogoService.desactivarProducto(id),
    onSuccess: () => {
      invalidar();
      toast.success('Producto desactivado: ya no se vende en el POS.');
    },
  });

  const desactivarServicio = useMutation<
    { servicio_id: number; actualizado: boolean },
    unknown,
    number
  >({
    mutationFn: (id) => CatalogoService.desactivarServicio(id),
    onSuccess: () => {
      invalidar();
      toast.success('Servicio desactivado: ya no se ofrece en el POS.');
    },
  });

  const enServicios = pestana === 'servicios';
  const filtrosActivos = enServicios ? filtrosServicios : filtrosProductos;
  const categoriasActivas = enServicios ? categoriasServicios : categoriasProductos;
  const metaActiva: Meta = (enServicios
    ? serviciosQuery.data?.meta
    : productosQuery.data?.meta) ?? {
    page: 1,
    limit: LIMIT,
    total: 0,
    totalPages: 1,
  };
  const cargandoActiva = enServicios ? serviciosQuery.isLoading : productosQuery.isLoading;
  const refrescandoActiva = enServicios ? serviciosQuery.isFetching : productosQuery.isFetching;
  const errorActivo = enServicios ? serviciosQuery.error : productosQuery.error;

  // En productos, un 500 de estos filtros es la migración 004 pendiente.
  const errorDeFiltro004 =
    !enServicios &&
    (filtrosProductos.consulta.estado !== 'todos' || filtrosProductos.consulta.categoria !== '');

  const recargar = () => {
    void (enServicios ? serviciosQuery.refetch() : productosQuery.refetch());
  };

  const abrirNuevo = () => {
    if (enServicios) setDrawerServicio({ abierto: true, servicio: null });
    else setDrawerProducto({ abierto: true, producto: null });
  };

  const cerrarBaja = () => {
    setBaja(null);
    desactivarProducto.reset();
    desactivarServicio.reset();
  };

  const confirmarBaja = () => {
    if (!baja) return;
    if (baja.tipo === 'producto') {
      desactivarProducto.mutate(baja.producto.id, { onSuccess: cerrarBaja });
    } else {
      desactivarServicio.mutate(baja.servicio.id, { onSuccess: cerrarBaja });
    }
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        titulo="Catálogo e inventario"
        descripcion={
          <span className="tabular">
            {enServicios
              ? `${formatNumero(metaActiva.total)} servicios · precio, costo de insumo y % del colaborador.`
              : `${formatNumero(metaActiva.total)} productos · stock y alerta de stock mínimo.`}
          </span>
        }
        icono={Package}
        acciones={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={recargar}
              disabled={refrescandoActiva}
            >
              <RefreshCw size={16} className={refrescandoActiva ? 'animate-spin' : ''} />
              Actualizar
            </button>
            <button type="button" className="btn-primary" onClick={abrirNuevo}>
              <Plus size={16} />
              {enServicios ? 'Nuevo servicio' : 'Nuevo producto'}
            </button>
          </div>
        }
      />

      <div
        className="panel flex w-fit gap-1 p-1"
        role="tablist"
        aria-label="Tipo de ítem del catálogo"
      >
        <button
          type="button"
          role="tab"
          aria-selected={enServicios}
          aria-controls="panel-servicios"
          className={enServicios ? 'btn-secondary text-sm' : 'btn-ghost text-sm'}
          onClick={() => setPestana('servicios')}
        >
          <Sparkles size={15} /> Servicios
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!enServicios}
          aria-controls="panel-productos"
          className={!enServicios ? 'btn-secondary text-sm' : 'btn-ghost text-sm'}
          onClick={() => setPestana('productos')}
        >
          <Package size={15} /> Productos
        </button>
      </div>

      <BarraFiltros
        idPrefijo={pestana}
        etiqueta={enServicios ? 'servicio' : 'producto'}
        filtros={filtrosActivos.filtros}
        categorias={categoriasActivas}
        hayFiltros={filtrosActivos.hayFiltros}
        onCambiar={filtrosActivos.cambiar}
        onLimpiar={filtrosActivos.limpiar}
      />

      <BannerError error={errorActivo} contexto004={errorDeFiltro004} />

      {enServicios ? (
        <div id="panel-servicios" role="tabpanel" aria-label="Servicios" className="space-y-6">
          <TablaServicios
            filas={filasServicios}
            cargando={cargandoActiva}
            conFiltros={filtrosServicios.hayFiltros}
            onLimpiar={filtrosServicios.limpiar}
            onEditar={(servicio) => setDrawerServicio({ abierto: true, servicio })}
            onDesactivar={(servicio) => setBaja({ tipo: 'servicio', servicio })}
          />
          <Paginador
            meta={metaActiva}
            cantidad={filasServicios.length}
            onIr={filtrosServicios.irAPagina}
          />
        </div>
      ) : (
        <div id="panel-productos" role="tabpanel" aria-label="Productos" className="space-y-6">
          <TablaProductos
            filas={filasProductos}
            cargando={cargandoActiva}
            conFiltros={filtrosProductos.hayFiltros}
            onLimpiar={filtrosProductos.limpiar}
            onEditar={(producto) => setDrawerProducto({ abierto: true, producto })}
            onDesactivar={(producto) => setBaja({ tipo: 'producto', producto })}
          />
          <Paginador
            meta={metaActiva}
            cantidad={filasProductos.length}
            onIr={filtrosProductos.irAPagina}
          />
        </div>
      )}

      {drawerServicio.abierto && (
        <DrawerServicio
          key={drawerServicio.servicio?.id ?? 'nuevo'}
          servicio={drawerServicio.servicio}
          categorias={categoriasServicios}
          onClose={() => setDrawerServicio({ abierto: false, servicio: null })}
        />
      )}

      {drawerProducto.abierto && (
        <DrawerProducto
          key={drawerProducto.producto?.id ?? 'nuevo'}
          producto={drawerProducto.producto}
          onClose={() => setDrawerProducto({ abierto: false, producto: null })}
        />
      )}

      {baja && (
        <ModalDesactivar
          tipo={baja.tipo}
          nombre={
            baja.tipo === 'producto' ? baja.producto.nombre_producto : baja.servicio.nombre_servicio
          }
          detalle={
            baja.tipo === 'producto'
              ? 'El producto dejará de aparecer en el POS pero se conserva el historial de ventas. Podrás reactivarlo editándolo y marcando «Activo».'
              : 'El servicio dejará de ofrecerse en el POS pero se conserva: las ventas y las comisiones ya liquidadas lo siguen referenciando. Podrás reactivarlo editándolo y marcando «Activo».'
          }
          pendiente={
            baja.tipo === 'producto' ? desactivarProducto.isPending : desactivarServicio.isPending
          }
          error={baja.tipo === 'producto' ? desactivarProducto.error : desactivarServicio.error}
          onCancelar={cerrarBaja}
          onConfirmar={confirmarBaja}
        />
      )}
    </div>
  );
}

// src/pages/POSPage.tsx
//
// POS de dos paneles (spec §3.3 de la guía de frontend):
//   · izquierda → catálogo (servicios · productos · adicionales)
//   · derecha   → ticket + panel de cobro
//   · móvil     → una sola columna; el ticket se abre en un `.sheet-panel`
//
// Contrato real (verificado contra Supabase y contra el backend F0):
//   `GET /catalogo/items`  → `ItemCatalogo[]` con `tipo` en MINÚSCULA.
//   `POST /ventas`         → crea la venta (idempotente).
//   `POST /ventas/:id/pagos` → registra el pago (idempotente, exige
//                              `cuenta_financiera_id` + `forma_pago`).
//
// ⚠️ La venta y el pago son **dos llamadas**: `crear_venta` no acepta forma de
// pago ni cuenta financiera. La `Idempotency-Key` se genera UNA sola vez por
// operación de cobro (nunca en cada click) y sólo se rota cuando el cobro
// termina con éxito.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Banknote,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Info,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  User,
  UserCheck,
  X,
} from 'lucide-react';

import { PageHeader } from '../components/PageHeader';
import { nuevaIdempotencyKey, type ApiError } from '../services/api';
import {
  CatalogoService,
  type ItemCatalogo,
  type TipoItemCatalogo,
} from '../services/catalog.service';
import { ClientesService, type Cliente } from '../services/clientes.service';
import { ColaboradoresService } from '../services/colaboradores.service';
import { FinanzasService } from '../services/finanzas.service';
import { CajasService } from '../services/cajas.service';
import { VentasService, type DetalleVentaInput } from '../services/ventas.service';
import {
  claseBadge,
  claseBanner,
  FORMA_PAGO,
  FORMAS_PAGO_OPCIONES,
  metaEstado,
  TIPO_CUENTA_FINANCIERA,
} from '../lib/estados';
import { formatMoney, formatNumero, iniciales } from '../lib/format';

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------
type FiltroTipo = 'todos' | TipoItemCatalogo;

/** Valores reales de la BD (`EFECTIVO | TARJETA | TRANSFERENCIA`), en mayúsculas. */
type FormaPagoValor = (typeof FORMAS_PAGO_OPCIONES)[number];

interface LineaTicket {
  item: ItemCatalogo;
  cantidad: number;
  /**
   * Colaborador asignado **a la línea** (override del global del ticket).
   * `null` = usar el colaborador global.
   *
   * ⚠️ Hoy es informativo: `crear_venta` sólo acepta un `colaborador_id` por
   * venta. La asignación por línea se persistirá con la migración de comandas.
   */
  colaboradorId: number | null;
}

// ---------------------------------------------------------------------------
// Constantes de presentación
// ---------------------------------------------------------------------------
const FILTROS: { valor: FiltroTipo; etiqueta: string }[] = [
  { valor: 'servicio', etiqueta: 'Servicios' },
  { valor: 'producto', etiqueta: 'Productos' },
  { valor: 'adicional', etiqueta: 'Adicionales' },
  { valor: 'todos', etiqueta: 'Todos' },
];

const ETIQUETA_TIPO: Record<TipoItemCatalogo, string> = {
  servicio: 'Servicio',
  producto: 'Producto',
  adicional: 'Adicional',
};

const ICONO_FORMA_PAGO: Record<FormaPagoValor, ReactNode> = {
  EFECTIVO: <Banknote size={16} aria-hidden="true" />,
  TARJETA: <CreditCard size={16} aria-hidden="true" />,
  TRANSFERENCIA: <Building2 size={16} aria-hidden="true" />,
};

/**
 * Referencias vacías estables: `data ?? []` crearía un array nuevo en cada
 * render y los `useMemo` que dependen de ellas se recalcularían siempre.
 */
const SIN_ITEMS: ItemCatalogo[] = [];
const SIN_CLIENTES: Cliente[] = [];

/** Mensajes de los códigos de negocio que puede devolver el cobro. */
const MENSAJES_API: Record<string, string> = {
  CAJA_NO_ABIERTA: 'No hay una caja abierta: ábrela y vuelve a intentar el cobro.',
  INSUFFICIENT_STOCK: 'No hay stock suficiente de uno de los productos del ticket.',
  VALIDATION_ERROR: 'La API rechazó los datos del cobro. Revisa el ticket.',
};

function mensajeDeError(err: unknown): string {
  const e = (err ?? {}) as Partial<ApiError>;
  if (e.error && MENSAJES_API[e.error]) return MENSAJES_API[e.error];
  return e.message || 'No se pudo completar la operación.';
}

/** `lg` de Tailwind son 1024px: por debajo, el ticket vive en un sheet. */
function useEsMovil(): boolean {
  const [esMovil, setEsMovil] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 1279px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279px)');
    const onChange = (e: MediaQueryListEvent) => setEsMovil(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return esMovil;
}

// ---------------------------------------------------------------------------
// Tarjeta de catálogo
// ---------------------------------------------------------------------------
interface TarjetaCatalogoProps {
  item: ItemCatalogo;
  onAgregar: (item: ItemCatalogo) => void;
}

function TarjetaCatalogo({ item, onAgregar }: TarjetaCatalogoProps) {
  // Los adicionales existen y se listan, pero el backend todavía no acepta
  // `adicional_id` en `crear_venta` (requiere la migración 005).
  const esAdicional = item.tipo === 'adicional';
  const sinStock = item.tipo === 'producto' && (item.stock_actual ?? 0) <= 0;
  const deshabilitado = esAdicional || sinStock;

  const motivo = esAdicional
    ? 'Disponible próximamente — requiere la migración de extras (005): el servidor aún no acepta adicional_id en crear_venta'
    : sinStock
      ? 'Sin stock disponible'
      : `Agregar ${item.nombre} al ticket`;

  const tono = esAdicional ? 'neutral' : item.tipo === 'servicio' ? 'accent' : 'info';

  return (
    <button
      type="button"
      onClick={() => onAgregar(item)}
      disabled={deshabilitado}
      title={motivo}
      className={`flex flex-col justify-between gap-2 rounded-md p-3 text-left ${
        deshabilitado ? 'panel cursor-not-allowed opacity-60' : 'glass-card cursor-pointer'
      }`}
    >
      <div className="space-y-1">
        <span className={claseBadge(tono)}>{ETIQUETA_TIPO[item.tipo]}</span>
        <h3 className="line-clamp-2 text-body font-semibold text-text-primary">{item.nombre}</h3>

        {item.tipo === 'servicio' && item.categoria && (
          <p className="text-body-sm text-text-muted">{item.categoria}</p>
        )}

        {item.tipo === 'producto' && (
          <p className="tabular text-body-sm text-text-muted">
            Stock: {formatNumero(item.stock_actual ?? 0)}
          </p>
        )}

        {esAdicional && (
          <p className="flex items-start gap-1 text-body-sm text-text-muted">
            <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            Disponible próximamente — requiere la migración de extras.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle pt-2">
        <span className="tabular text-body font-bold text-accent-from">
          {formatMoney(item.precio)}
        </span>
        {!deshabilitado && <Plus size={16} className="text-text-muted" aria-hidden="true" />}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export function POSPage() {
  // ── Datos ────────────────────────────────────────────────────────────────
  // Nota histórica: antes el POS llamaba a `GET /catalogo` (que no existía)
  // dentro de un `Promise.all`, así que el 404 tumbaba también clientes y
  // colaboradores. Ahora cada recurso tiene su propia query y una sola llamada
  // a `/catalogo/items`.
  const catalogoQ = useQuery({
    queryKey: ['pos', 'catalogo'],
    queryFn: () => CatalogoService.listarItems(),
  });
  const colaboradoresQ = useQuery({
    queryKey: ['colaboradores', 'list', { activo: true, limit: 100 }],
    queryFn: () => ColaboradoresService.listar({ activo: true, limit: 100 }),
  });
  const clientesQ = useQuery({
    queryKey: ['clientes', 'list', { page: 1, limit: 100 }],
    queryFn: () => ClientesService.listar(1, 100),
  });
  const cuentasQ = useQuery({
    queryKey: ['finanzas', 'cuentas', { activo: true }],
    queryFn: () => FinanzasService.listar({ activo: true }),
  });
  const cajaQ = useQuery({
    queryKey: ['cajas', 'abierta'],
    queryFn: () => CajasService.obtenerAbierta(),
  });

  const items = catalogoQ.data ?? SIN_ITEMS;
  const colaboradores = colaboradoresQ.data?.data ?? [];
  const clientes = clientesQ.data?.data ?? SIN_CLIENTES;
  const cuentas = cuentasQ.data ?? [];
  const cajaAbierta = cajaQ.data ?? null;

  // ── Estado de UI ─────────────────────────────────────────────────────────
  const esMovil = useEsMovil();

  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('servicio');
  const [busqueda, setBusqueda] = useState('');

  const [lineas, setLineas] = useState<LineaTicket[]>([]);

  // ⚠️ `number | null`, no `string`: `clientes.id` es un `number` en la respuesta
  // real de la API. Con `useState('')` la comparación `c.id === clienteId`
  // (number vs string) era **siempre falsa**, así que el cliente seleccionado
  // nunca se resaltaba y el `<select>`/lista no reflejaban la selección.
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const clienteRef = useRef<HTMLDivElement | null>(null);

  const [colaboradorId, setColaboradorId] = useState('');
  const [formaPago, setFormaPago] = useState<FormaPagoValor>('EFECTIVO');
  const [cuentaId, setCuentaId] = useState('');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [notas, setNotas] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const [sheetAbierto, setSheetAbierto] = useState(false);

  /**
   * Si `crear_venta` tuvo éxito pero el pago falló (p. ej. `CAJA_NO_ABIERTA`),
   * la venta ya existe: guardamos su id y su total para **no volver a crearla**
   * en el reintento. Es defensa en profundidad mientras la migración 002
   * (`idempotency_keys`) siga sin aplicarse.
   */
  const [ventaPendiente, setVentaPendiente] = useState<{
    ventaId: number;
    total: number;
  } | null>(null);

  // IDEMPOTENCIA: una clave por operación de cobro, generada al montar el
  // formulario. Se rota **sólo** al limpiar el ticket (cobro exitoso o nuevo
  // ticket), nunca en cada click: regenerarla anularía la protección contra
  // doble cobro.
  const [cobroKey, setCobroKey] = useState(() => nuevaIdempotencyKey());
  const [pagoKey, setPagoKey] = useState(() => nuevaIdempotencyKey());

  // Esc cierra el sheet móvil y el dropdown de cliente.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setClienteAbierto(false);
      setSheetAbierto(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Click fuera del dropdown de cliente.
  useEffect(() => {
    if (!clienteAbierto) return;
    const onPointerDown = (e: PointerEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) {
        setClienteAbierto(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [clienteAbierto]);

  // ── Derivados ────────────────────────────────────────────────────────────
  const conteos = useMemo<Record<FiltroTipo, number>>(
    () => ({
      servicio: items.filter((i) => i.tipo === 'servicio').length,
      producto: items.filter((i) => i.tipo === 'producto').length,
      adicional: items.filter((i) => i.tipo === 'adicional').length,
      todos: items.length,
    }),
    [items],
  );

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((item) => {
      const coincideTipo = filtroTipo === 'todos' || item.tipo === filtroTipo;
      if (!coincideTipo) return false;
      if (!q) return true;
      return (
        item.nombre.toLowerCase().includes(q) || (item.categoria ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, filtroTipo, busqueda]);

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || (c.telefono ?? '').includes(q),
    );
  }, [clientes, busquedaCliente]);

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId) ?? null;

  const subtotal = useMemo(
    () => lineas.reduce((acc, l) => acc + l.item.precio * l.cantidad, 0),
    [lineas],
  );
  const total = subtotal;
  const totalUnidades = useMemo(() => lineas.reduce((acc, l) => acc + l.cantidad, 0), [lineas]);

  const recibido = Number(montoRecibido);
  const recibidoValido = montoRecibido.trim() !== '' && Number.isFinite(recibido);
  const faltante = formaPago === 'EFECTIVO' && recibidoValido ? Math.max(0, total - recibido) : 0;
  const cambio = formaPago === 'EFECTIVO' && recibidoValido ? Math.max(0, recibido - total) : 0;

  const motivos: string[] = [];
  if (lineas.length === 0) motivos.push('Agrega al menos un ítem al ticket.');
  if (!cuentaId) motivos.push('Elige la cuenta financiera que recibe el dinero.');
  if (faltante > 0) {
    motivos.push(`El monto recibido es menor al total. Faltan ${formatMoney(faltante)}.`);
  }
  const bloqueado = motivos.length > 0 || enviando;

  // ── Acciones del catálogo ────────────────────────────────────────────────
  const agregarItem = (item: ItemCatalogo) => {
    if (item.tipo === 'adicional') {
      // Defensa: el botón ya está deshabilitado. Nunca metemos el id de un
      // adicional en `producto_servicio_id`: colisionaría con servicios.
      toast.info('Los adicionales llegarán con la migración de extras.');
      return;
    }
    if (item.tipo === 'producto' && (item.stock_actual ?? 0) <= 0) {
      toast.warning('Sin stock disponible.');
      return;
    }

    // El aviso de stock se decide fuera del updater: los updaters de React
    // deben ser puros (StrictMode los invoca dos veces en desarrollo).
    const existente = lineas.find((l) => l.item.id === item.id);
    const maximo = maximoDeItem(item);
    if (existente && maximo !== null && existente.cantidad + 1 > maximo) {
      toast.warning(`Sólo hay ${formatNumero(maximo)} en stock de ${item.nombre}.`);
      return;
    }

    setLineas((prev) =>
      prev.some((l) => l.item.id === item.id)
        ? prev.map((l) => (l.item.id === item.id ? { ...l, cantidad: l.cantidad + 1 } : l))
        : [...prev, { item, cantidad: 1, colaboradorId: null }],
    );
  };

  const cambiarCantidad = (itemId: number, delta: number) => {
    const actual = lineas.find((l) => l.item.id === itemId);
    if (!actual) return;

    const nueva = actual.cantidad + delta;
    const maximo = maximoDeItem(actual.item);
    if (maximo !== null && nueva > maximo) {
      toast.warning(`Sólo hay ${formatNumero(maximo)} en stock de ${actual.item.nombre}.`);
      return;
    }

    setLineas((prev) =>
      nueva > 0
        ? prev.map((l) => (l.item.id === itemId ? { ...l, cantidad: nueva } : l))
        : prev.filter((l) => l.item.id !== itemId),
    );
  };

  const quitarLinea = (itemId: number) => {
    setLineas((prev) => prev.filter((l) => l.item.id !== itemId));
  };

  const asignarColaboradorLinea = (itemId: number, valor: string) => {
    setLineas((prev) =>
      prev.map((l) =>
        l.item.id === itemId ? { ...l, colaboradorId: valor === '' ? null : Number(valor) } : l,
      ),
    );
  };

  /** Colaborador efectivo de una línea: su override o el global del ticket. */
  const colaboradorDeLinea = (l: LineaTicket): number | null =>
    l.colaboradorId ?? (colaboradorId === '' ? null : Number(colaboradorId));

  const limpiarTicket = () => {
    setLineas([]);
    setMontoRecibido('');
    setNotas('');
    setErrorCobro(null);
    setVentaPendiente(null);
    setCobroKey(nuevaIdempotencyKey());
    setPagoKey(nuevaIdempotencyKey());
  };

  // ── Cobro ────────────────────────────────────────────────────────────────
  const handleCobrar = async () => {
    if (bloqueado) return;

    setEnviando(true);
    setErrorCobro(null);

    // Si la venta ya se creó en un intento anterior, se cobra ese mismo total.
    const totalACobrar = ventaPendiente ? ventaPendiente.total : total;

    try {
      let ventaId: number | null = ventaPendiente ? ventaPendiente.ventaId : null;

      if (ventaId === null) {
        const detalles: DetalleVentaInput[] = lineas.map((l) => ({
          tipo_item: l.item.tipo as DetalleVentaInput['tipo_item'],
          producto_servicio_id: l.item.id,
          cantidad: l.cantidad,
          precio_unitario: l.item.precio,
        }));

        const venta = await VentasService.crearVenta(
          {
            colaborador_id: colaboradorId ? Number(colaboradorId) : undefined,
            cliente_id: clienteId ?? undefined,
            detalles,
            notas: notas.trim() || undefined,
          },
          cobroKey,
        );
        ventaId = venta.venta_id;
        setVentaPendiente({ ventaId, total: totalACobrar });
      }

      await VentasService.registrarPago(
        ventaId,
        {
          monto: totalACobrar,
          formaPago,
          cuentaFinancieraId: Number(cuentaId),
          notas: notas.trim() || undefined,
        },
        pagoKey,
      );

      toast.success(`Cobro registrado · Venta #${ventaId} · ${formatMoney(totalACobrar)}`);
      limpiarTicket();
      setSheetAbierto(false);
    } catch (err) {
      setErrorCobro(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  // ── Panel del ticket (compartido escritorio / sheet móvil) ────────────────
  const ticketPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-h2 text-text-primary">
          <ShoppingCart size={18} className="text-accent-from" aria-hidden="true" />
          Ticket
          {totalUnidades > 0 && (
            <span className={claseBadge('accent')}>{formatNumero(totalUnidades)} ítems</span>
          )}
        </h2>
        {esMovil && (
          <button
            type="button"
            className="btn-icon"
            aria-label="Cerrar ticket"
            onClick={() => setSheetAbierto(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Cliente */}
      <div className="relative shrink-0" ref={clienteRef}>
        <label htmlFor="pos-cliente" className="label">
          Cliente
        </label>
        <button
          id="pos-cliente"
          type="button"
          className="btn-secondary w-full"
          aria-expanded={clienteAbierto}
          onClick={() => setClienteAbierto((v) => !v)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <User size={14} className="shrink-0 text-accent-from" aria-hidden="true" />
            <span className="truncate">
              {clienteSeleccionado ? clienteSeleccionado.nombre : 'Sin cliente / mostrador'}
            </span>
          </span>
          <ChevronDown size={14} className="shrink-0" aria-hidden="true" />
        </button>

        {clienteAbierto && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-sm border border-border-subtle bg-bg-elevated shadow-lg">
            <div className="border-b border-border-subtle p-2">
              <label htmlFor="pos-buscar-cliente" className="sr-only">
                Buscar cliente por nombre o teléfono
              </label>
              <input
                id="pos-buscar-cliente"
                type="search"
                className="input"
                placeholder="Buscar por nombre o teléfono…"
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                autoFocus
              />
            </div>
            <ul className="max-h-48 overflow-y-auto">
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm text-text-muted hover:bg-surface-card"
                  onClick={() => {
                    setClienteId(null);
                    setClienteAbierto(false);
                    setBusquedaCliente('');
                  }}
                >
                  <X size={12} aria-hidden="true" />
                  Sin cliente / mostrador
                </button>
              </li>
              {clientesFiltrados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm text-text-primary hover:bg-surface-card"
                    onClick={() => {
                      setClienteId(c.id);
                      setClienteAbierto(false);
                      setBusquedaCliente('');
                    }}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-from/15 text-label text-accent-from">
                      {iniciales(c.nombre)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                    {c.telefono && <span className="text-text-muted">{c.telefono}</span>}
                    {clienteId === c.id && (
                      <Check size={14} className="shrink-0 text-success" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
              {clientesFiltrados.length === 0 && (
                <li className="px-3 py-2 text-body-sm text-text-muted">Sin resultados</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Colaborador del ticket (opcional: venta directa del spa = sin comisión, decisión D-1) */}
      <div className="shrink-0">
        <label htmlFor="pos-colaborador" className="label">
          Colaborador del ticket
        </label>
        <div className="flex items-center gap-2">
          <UserCheck size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
          <select
            id="pos-colaborador"
            className="select"
            value={colaboradorId}
            onChange={(e) => setColaboradorId(e.target.value)}
            disabled={colaboradoresQ.isPending}
          >
            <option value="">
              {colaboradoresQ.isPending ? 'Cargando…' : 'Venta del spa (sin colaborador)'}
            </option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        {!colaboradorId && (
          <p className="field-help">Sin colaborador la venta no genera comisión.</p>
        )}
        {colaboradoresQ.isError && (
          <p className="field-error">
            <AlertTriangle size={12} aria-hidden="true" />
            No se pudieron cargar los colaboradores.
          </p>
        )}
        {!colaboradoresQ.isPending && colaboradores.length === 0 && (
          <p className="field-help">
            No hay colaboradores activos: la venta queda a nombre del spa.
          </p>
        )}
      </div>

      {/* Líneas */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {lineas.length === 0 ? (
          <p className="py-10 text-center text-body-sm text-text-muted">
            El ticket está vacío. Toca un ítem del catálogo para agregarlo.
          </p>
        ) : (
          <ul>
            {lineas.map((l) => {
              const efectivo = colaboradorDeLinea(l);
              const maximo = maximoDeItem(l.item);
              return (
                <li
                  key={l.item.id}
                  className="space-y-2 border-b border-border-subtle py-3 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-label text-text-primary">{l.item.nombre}</p>
                      <p className="tabular text-body-sm text-text-muted">
                        {formatMoney(l.item.precio)} c/u
                        {maximo !== null && ` · stock ${formatNumero(maximo)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Quitar una unidad de ${l.item.nombre}`}
                        onClick={() => cambiarCantidad(l.item.id, -1)}
                      >
                        <Minus size={14} aria-hidden="true" />
                      </button>
                      <span className="tabular w-6 text-center text-label text-text-primary">
                        {formatNumero(l.cantidad)}
                      </span>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Agregar una unidad de ${l.item.nombre}`}
                        onClick={() => cambiarCantidad(l.item.id, 1)}
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                      <span className="tabular w-16 text-right text-label text-accent-from">
                        {formatMoney(l.item.precio * l.cantidad)}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        aria-label={`Quitar ${l.item.nombre} del ticket`}
                        onClick={() => quitarLinea(l.item.id)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor={`pos-linea-colab-${l.item.id}`} className="sr-only">
                      Colaborador de {l.item.nombre}
                    </label>
                    <select
                      id={`pos-linea-colab-${l.item.id}`}
                      className="select"
                      value={efectivo === null ? '' : String(efectivo)}
                      onChange={(e) => asignarColaboradorLinea(l.item.id, e.target.value)}
                    >
                      <option value="">— Sin colaborador asignado —</option>
                      {colaboradores.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {lineas.length > 0 && (
        <p className="field-help flex shrink-0 items-start gap-1">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          El colaborador por línea es informativo: la venta se registra con el colaborador del
          ticket (el reparto por línea llega con la migración de comandas).
        </p>
      )}

      {/* Totales + cobro */}
      <div className="shrink-0 space-y-3 border-t border-border-subtle pt-3">
        <div className="flex items-center justify-between">
          <span className="text-body-sm text-text-secondary">Subtotal</span>
          <span className="tabular text-body font-semibold text-text-primary">
            {formatMoney(subtotal)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-body font-bold text-text-primary">Total</span>
          <span className="text-gradient tabular text-h1">{formatMoney(total)}</span>
        </div>

        <fieldset>
          <legend className="label">Forma de pago</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {FORMAS_PAGO_OPCIONES.map((valor) => {
              const activo = formaPago === valor;
              return (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFormaPago(valor)}
                  aria-pressed={activo}
                  className={`inline-flex flex-col items-center justify-center gap-1 rounded-sm border px-2 py-2 text-label transition-colors ${
                    activo
                      ? 'border-accent-from/50 bg-accent-from/15 text-accent-from'
                      : 'border-border-subtle bg-surface-card text-text-muted hover:text-text-primary'
                  }`}
                >
                  {ICONO_FORMA_PAGO[valor]}
                  {metaEstado(FORMA_PAGO, valor).label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="pos-cuenta" className="label">
            Cuenta financiera *
          </label>
          <select
            id="pos-cuenta"
            className="select"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            disabled={cuentasQ.isPending}
          >
            <option value="">
              {cuentasQ.isPending ? 'Cargando…' : 'Selecciona la cuenta destino…'}
            </option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {metaEstado(TIPO_CUENTA_FINANCIERA, c.tipo).label}
              </option>
            ))}
          </select>
          {cuentasQ.isError ? (
            <p className="field-error">
              <AlertTriangle size={12} aria-hidden="true" />
              No se pudieron cargar las cuentas financieras.
            </p>
          ) : !cuentasQ.isPending && cuentas.length === 0 ? (
            <p className="field-error">
              <AlertTriangle size={12} aria-hidden="true" />
              No hay cuentas financieras activas: sin cuenta no se puede cobrar.
            </p>
          ) : (
            <p className="field-help">Obligatoria: es el destino del dinero.</p>
          )}
        </div>

        {formaPago === 'EFECTIVO' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pos-recibido" className="label">
                Monto recibido
              </label>
              <input
                id="pos-recibido"
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder={formatMoney(total)}
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
              />
              {faltante > 0 ? (
                <p className="field-error">
                  <AlertTriangle size={12} aria-hidden="true" />
                  Faltan {formatMoney(faltante)}
                </p>
              ) : (
                <p className="field-help">
                  {montoRecibido.trim() === ''
                    ? 'Déjalo vacío para cobro exacto.'
                    : 'Cubre el total.'}
                </p>
              )}
            </div>
            <div>
              <span className="label">Cambio</span>
              <p className="tabular rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-body font-bold text-success">
                {formatMoney(cambio)}
              </p>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="pos-notas" className="label">
            Notas
          </label>
          <textarea
            id="pos-notas"
            className="textarea"
            rows={2}
            placeholder="Referencia, observación del cobro…"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>

        {ventaPendiente && (
          <div className={claseBanner('info')} role="status">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              La venta <strong>#{ventaPendiente.ventaId}</strong> ya se creó por{' '}
              {formatMoney(ventaPendiente.total)}; sólo falta registrar el pago. Reintenta el cobro:
              se reutilizan la misma clave de idempotencia y la misma venta.
            </p>
          </div>
        )}

        {errorCobro && (
          <div className={claseBanner('danger')} role="alert">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">No se pudo registrar el cobro.</p>
              <p>{errorCobro}</p>
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn-primary w-full"
          onClick={handleCobrar}
          disabled={bloqueado}
        >
          {enviando ? (
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          ) : (
            <Banknote size={16} aria-hidden="true" />
          )}
          Cobrar {formatMoney(total)}
        </button>

        {motivos.length > 0 && (
          <ul className="space-y-1">
            {motivos.map((m) => (
              <li key={m} className="flex items-start gap-1.5 text-body-sm text-text-muted">
                <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                {m}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="page-container space-y-6">
      {/*
        Sin `descripcion` a propósito, a diferencia del resto de páginas.
        «Catálogo a la izquierda; ticket a la derecha» describe **lo que ya se
        está viendo**, y aquí cada píxel vertical cuenta: el terminal está
        diseñado para que catálogo y ticket quepan **sin scroll**, y una línea de
        texto que no aporta son 24 px que le faltan al catálogo.
      */}
      <PageHeader titulo="Terminal POS" icono={Store} />

      {/* La caja se avisa ANTES de abrir el cobro, y en las dos columnas. */}
      {cajaQ.isSuccess && !cajaAbierta && (
        <div className={claseBanner('warning')} role="status">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">No hay caja abierta.</p>
            <p>
              Puedes armar el ticket, pero el cobro será rechazado.{' '}
              <Link to="/caja" className="font-semibold underline">
                Abrir caja
              </Link>
            </p>
          </div>
        </div>
      )}

      {/*
        ⚠️ **El alto es un cálculo, y hay que mantenerlo si cambia el chrome.**

        Estaba en `100vh - 8rem`, que cuadraba **antes** de añadir el `PageHeader`.
        Con él, la cuenta es:

          64 px  Header del layout (`h-16`)
        + 24 px  padding superior de `main` (`p-6`)
        + 36 px  PageHeader sin descripción (`text-h1` = 2.25rem)
        + 24 px  separación `space-y-6`
        ───────
         148 px  ≈ 9.25rem  de chrome

        Con `12rem` (192 px) sobran ~44 px, que cubren el padding inferior y dejan
        un margen para el redondeo sub-píxel. **Si se añade o quita algo del
        encabezado, este número deja de cuadrar y vuelve el scroll corto** — que
        en un terminal de caja es justo lo que no se quiere.
      */}
      <div className="grid grid-cols-1 gap-4 xl:h-[calc(100vh-12rem)] xl:grid-cols-12">
        {/* ── Panel izquierdo: catálogo ── */}
        <section
          className="panel flex min-h-0 flex-col gap-3 overflow-hidden p-4 xl:col-span-7"
          aria-label="Catálogo"
        >
          <div className="flex shrink-0 flex-col gap-3 2xl:flex-row">
            <div className="flex flex-1 items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-3 focus-within:border-border-strong">
              <Search size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
              <label htmlFor="pos-buscar" className="sr-only">
                Buscar en el catálogo
              </label>
              <input
                id="pos-buscar"
                type="search"
                className="w-full bg-transparent py-2.5 text-body text-text-primary placeholder:text-text-muted"
                placeholder="Buscar servicio, producto o categoría…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
              {FILTROS.map((f) => {
                const activo = filtroTipo === f.valor;
                return (
                  <button
                    key={f.valor}
                    type="button"
                    onClick={() => setFiltroTipo(f.valor)}
                    aria-pressed={activo}
                    className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-label transition-colors ${
                      activo
                        ? 'border-accent-from/40 bg-accent-from/15 text-accent-from'
                        : 'border-border-subtle bg-surface-card text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {f.etiqueta}
                    <span className="tabular opacity-80">{formatNumero(conteos[f.valor])}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {catalogoQ.isPending ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-28" />
                ))}
              </div>
            ) : catalogoQ.isError ? (
              <div className={claseBanner('danger')} role="alert">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-semibold">No se pudo cargar el catálogo.</p>
                  <p>{mensajeDeError(catalogoQ.error)}</p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void catalogoQ.refetch()}
                >
                  Reintentar
                </button>
              </div>
            ) : itemsFiltrados.length === 0 ? (
              <p className="py-16 text-center text-body text-text-muted">
                {items.length === 0
                  ? 'El catálogo está vacío. Crea servicios o productos para poder cobrar.'
                  : 'Sin resultados para esa búsqueda.'}
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {itemsFiltrados.map((item) => (
                  <TarjetaCatalogo key={item.id} item={item} onAgregar={agregarItem} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Panel derecho: ticket (escritorio) ── */}
        {!esMovil && (
          <aside
            className="panel flex min-h-0 flex-col overflow-hidden p-4 xl:col-span-5"
            aria-label="Ticket de venta"
          >
            {ticketPanel}
          </aside>
        )}
      </div>

      {/* ── Móvil: botón flotante + sheet ── */}
      {esMovil && (
        <>
          <button
            type="button"
            className="btn-primary fixed bottom-6 right-6 z-30 shadow-lg"
            aria-expanded={sheetAbierto}
            aria-label={`Abrir ticket: ${formatNumero(totalUnidades)} ítems, ${formatMoney(total)}`}
            onClick={() => setSheetAbierto(true)}
          >
            <ShoppingCart size={18} aria-hidden="true" />
            <span className="tabular">
              {formatNumero(totalUnidades)} · {formatMoney(total)}
            </span>
          </button>

          {sheetAbierto && (
            <>
              <div
                className="drawer-backdrop"
                onClick={() => setSheetAbierto(false)}
                aria-hidden="true"
              />
              <div
                className="sheet-panel overflow-hidden p-4"
                role="dialog"
                aria-modal="true"
                aria-label="Ticket de venta"
              >
                {ticketPanel}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Tope de unidades de una línea: el stock real de un producto. */
function maximoDeItem(item: ItemCatalogo): number | null {
  if (item.tipo !== 'producto') return null;
  return typeof item.stock_actual === 'number' ? item.stock_actual : null;
}

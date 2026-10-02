// src/pages/CuentasPage.tsx
//
// Cuentas por cobrar (crédito a clientes) y por pagar (proveedores).
//
// Contrato real (`src/services/cuentas.service.ts`): campos en **snake_case**,
// `id` / `cliente_id` numéricos, listados paginados con `{ data, meta }`.
//
// ⚠️ Dinero: cada abono/pago lleva `forma_pago` y `cuenta_financiera_id`
// (obligatorios en el DTO del backend) y una `Idempotency-Key` generada **una
// sola vez al abrir el drawer**, no en cada clic (SPED §7).
import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  CreditCard,
  Plus,
  Wallet,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '../components/PageHeader';
import {
  CuentasService,
  type CuentaCobrar,
  type CuentaPagar,
  type MovimientoCuentaInput,
} from '../services/cuentas.service';
import { FinanzasService } from '../services/finanzas.service';
import { ClientesService } from '../services/clientes.service';
import { nuevaIdempotencyKey } from '../services/api';
import { formatFecha, formatMoney } from '../lib/format';
import {
  ESTADO_CUENTA,
  FORMAS_PAGO_OPCIONES,
  claseBadge,
  claseBanner,
  metaEstado,
} from '../lib/estados';

// ---------------------------------------------------------------------------
// Tipos y utilidades locales
// ---------------------------------------------------------------------------
type Tab = 'COBRAR' | 'PAGAR';
type Meta = { page: number; limit: number; total: number; totalPages: number };

const CUENTAS_KEY = 'cuentas';
const CLIENTES_KEY = 'clientes';

/** Estados reales de `cuentas_por_cobrar.estado` / `cuentas_por_pagar.estado`. */
const OPCIONES_ESTADO = Object.keys(ESTADO_CUENTA) as (keyof typeof ESTADO_CUENTA)[];

/** `estado.icono` es un string en `lib/estados`; aquí se resuelve a componente. */
const ICONOS_ESTADO: Record<keyof typeof ESTADO_CUENTA, LucideIcon> = {
  PENDIENTE: Clock,
  PARCIAL: CircleDollarSign,
  PAGADA: CheckCircle2,
  VENCIDA: AlertTriangle,
  ANULADA: Ban,
};

type VistaEstado = {
  label: string;
  badge: string;
  Icono: LucideIcon;
  /** true sólo cuando la cuenta está vencida y todavía tiene saldo. */
  vencida: boolean;
};

/** `2026-02-23` (o ISO completo) → comparable con hoy, sin desfase de zona. */
function aFechaSoloDia(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

function hoySoloDia(): Date {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

/**
 * Un vencimiento que ya pasó con saldo pendiente es lo más urgente de la tabla,
 * aunque la columna `estado` de la BD todavía diga `PENDIENTE` o `PARCIAL`.
 */
function estaVencida(
  fechaVencimiento: string | null,
  saldoPendiente: number,
  estado: string,
): boolean {
  if (!fechaVencimiento || saldoPendiente <= 0) return false;
  if (estado === 'PAGADA' || estado === 'ANULADA') return false;
  if (estado === 'VENCIDA') return true;
  const vence = aFechaSoloDia(fechaVencimiento);
  if (Number.isNaN(vence.getTime())) return false;
  return vence.getTime() < hoySoloDia().getTime();
}

/** Estado con ícono + texto; el tono `danger` se impone si está vencida. */
function vistaEstado(estado: string, vencida: boolean): VistaEstado {
  if (vencida) {
    return {
      label: metaEstado(ESTADO_CUENTA, 'VENCIDA').label,
      badge: claseBadge('danger'),
      Icono: AlertTriangle,
      vencida: true,
    };
  }
  const clave = (Object.keys(ESTADO_CUENTA) as string[]).includes(estado)
    ? (estado as keyof typeof ESTADO_CUENTA)
    : null;
  const meta = metaEstado(ESTADO_CUENTA, estado);
  return {
    label: meta.label,
    badge: claseBadge(meta.tono),
    Icono: clave ? ICONOS_ESTADO[clave] : Wallet,
    vencida: false,
  };
}

function mensajeError(err: unknown): string {
  const e = err as { error?: string; message?: string } | null;
  if (e?.error === 'MONTO_EXCEDE_SALDO') {
    return 'El monto supera el saldo pendiente de la cuenta.';
  }
  if (e?.error === 'NOT_FOUND') {
    return 'La cuenta ya no existe o fue anulada. Actualiza la lista.';
  }
  if (e?.error === 'VALIDATION_ERROR') {
    return e.message ?? 'Revisa los datos: monto, forma de pago y cuenta financiera.';
  }
  return e?.message ?? 'No se pudo completar la operación.';
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------
/**
 * Registrar abono o pago es la misma operación con distinto endpoint.
 * El genérico se declara explícito porque ambos servicios devuelven un id con
 * nombre propio (`abono_id` / `pago_id`) y la inferencia se queda con el primero.
 */
function useMovimientoCuentas(
  tipo: 'cobrar' | 'pagar',
  cuentaId: number,
  idempotencyKey: string,
) {
  return useMutation<
    { abono_id?: number; pago_id?: number },
    unknown,
    MovimientoCuentaInput
  >({
    mutationFn: (input) =>
      tipo === 'cobrar'
        ? CuentasService.registrarAbono(cuentaId, input, idempotencyKey)
        : CuentasService.registrarPagoProveedor(cuentaId, input, idempotencyKey),
  });
}

interface AltaCuentaPayload {
  tipo: Tab;
  cobrar: Parameters<typeof CuentasService.crearCobrar>[0];
  pagar: Parameters<typeof CuentasService.crearPagar>[0];
}

function useAltaCuenta() {
  return useMutation<
    { cuenta_cobrar_id?: number; cuenta_pagar_id?: number },
    unknown,
    AltaCuentaPayload
  >({
    mutationFn: (input) =>
      input.tipo === 'COBRAR'
        ? CuentasService.crearCobrar(input.cobrar)
        : CuentasService.crearPagar(input.pagar),
  });
}

/** Forma común de los listados; la fila es la unión de ambos servicios. */
interface ListadoCuentas {
  data: Array<CuentaCobrar | CuentaPagar>;
  meta?: Meta;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
}

/**
 * Se consultan ambos listados (uno queda `enabled: false`) para que cada
 * `queryFn` conserve el tipo exacto que devuelve su servicio; una sola llamada
 * condicional perdería el tipo de fila.
 */
function useCuentas(tab: Tab, estado: string, page: number): ListadoCuentas {
  const cobrar = useQuery({
    queryKey: [CUENTAS_KEY, 'COBRAR', { estado: estado || null, page }],
    queryFn: () => CuentasService.listarCobrar({ estado: estado || undefined, page, limit: 20 }),
    placeholderData: (prev) => prev,
    enabled: tab === 'COBRAR',
  });

  const pagar = useQuery({
    queryKey: [CUENTAS_KEY, 'PAGAR', { estado: estado || null, page }],
    queryFn: () => CuentasService.listarPagar({ estado: estado || undefined, page, limit: 20 }),
    placeholderData: (prev) => prev,
    enabled: tab === 'PAGAR',
  });

  if (tab === 'COBRAR') {
    return {
      data: cobrar.data?.data ?? [],
      meta: cobrar.data?.meta,
      isLoading: cobrar.isLoading,
      isFetching: cobrar.isFetching,
      error: cobrar.error,
    };
  }

  return {
    data: pagar.data?.data ?? [],
    meta: pagar.data?.meta,
    isLoading: pagar.isLoading,
    isFetching: pagar.isFetching,
    error: pagar.error,
  };
}

function useClientes() {
  return useQuery({
    queryKey: [CLIENTES_KEY, 'opciones'],
    queryFn: () => ClientesService.listar(1, 100),
    staleTime: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export const CuentasPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('COBRAR');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);

  const [movimiento, setMovimiento] = useState<MovimientoDrawerProps | null>(null);
  const [altaVisible, setAltaVisible] = useState(false);

  const listado = useCuentas(tab, estado, page);
  const { isLoading, isFetching, error } = listado;
  const { data: clientesRes } = useClientes();

  const nombresClientes: Record<string, string> = {};
  for (const c of clientesRes?.data ?? []) nombresClientes[c.id] = c.nombre;

  const filas = listado.data;
  const meta: Meta | undefined = listado.meta;

  const cambiarTab = (nuevo: Tab) => {
    setTab(nuevo);
    setEstado('');
    setPage(1);
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        titulo="Cuentas por cobrar y por pagar"
        descripcion="Créditos a clientes y adeudos con proveedores. Registra abonos y pagos indicando siempre la forma de pago y la cuenta financiera de origen o destino."
        icono={CreditCard}
        acciones={
          <button
            type="button"
            onClick={() => setAltaVisible(true)}
            className="btn-primary"
          >
            <Plus size={16} /> Nueva cuenta
          </button>
        }
      />

      {/* Pestañas */}
      <div
        className="panel flex w-fit gap-1 p-1"
        role="tablist"
        aria-label="Tipo de cuenta"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'COBRAR'}
          onClick={() => cambiarTab('COBRAR')}
          className={`flex items-center gap-2 rounded-sm px-4 py-1.5 text-label transition-colors ${
            tab === 'COBRAR'
              ? 'bg-surface-card text-text-primary'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <ArrowDownLeft size={14} /> Por cobrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'PAGAR'}
          onClick={() => cambiarTab('PAGAR')}
          className={`flex items-center gap-2 rounded-sm px-4 py-1.5 text-label transition-colors ${
            tab === 'PAGAR'
              ? 'bg-surface-card text-text-primary'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <ArrowUpRight size={14} /> Por pagar
        </button>
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <label htmlFor="filtro-estado" className="label">
            Estado
          </label>
          <select
            id="filtro-estado"
            className="select"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            {OPCIONES_ESTADO.map((clave) => (
              <option key={clave} value={clave}>
                {ESTADO_CUENTA[clave].label}
              </option>
            ))}
          </select>
        </div>
        {(estado || page > 1) && (
          <button
            type="button"
            className="btn-ghost text-body-sm"
            onClick={() => {
              setEstado('');
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>
        )}
        {isFetching && !isLoading && (
          <span className="pb-2 text-body-sm text-text-muted">Actualizando…</span>
        )}
      </div>

      {Boolean(error) && (
        <div className={claseBanner('danger')} role="alert">
          <AlertTriangle size={16} />
          <span>{mensajeError(error)}</span>
        </div>
      )}

      {/* Tabla */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Contraparte</th>
                <th scope="col">Creada</th>
                <th scope="col">Vence</th>
                <th scope="col" className="num">
                  Monto total
                </th>
                <th scope="col" className="num">
                  {tab === 'COBRAR' ? 'Abonado' : 'Pagado'}
                </th>
                <th scope="col" className="num">
                  Saldo pendiente
                </th>
                <th scope="col">Estado</th>
                <th scope="col" className="num">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td colSpan={8} className="p-4">
                      <div className="skeleton h-4 w-full" />
                    </td>
                  </tr>
                ))}

              {!isLoading &&
                filas.map((fila) => {
                  const vencida = estaVencida(
                    fila.fecha_vencimiento,
                    Number(fila.saldo_pendiente),
                    fila.estado,
                  );
                  const esCobrar = tab === 'COBRAR';
                  const contraparte = esCobrar
                    ? (nombresClientes[String((fila as CuentaCobrar).cliente_id)] ??
                      `Cliente #${(fila as CuentaCobrar).cliente_id}`)
                    : (fila as CuentaPagar).beneficiario;
                  const abonado = esCobrar
                    ? (fila as CuentaCobrar).monto_abonado
                    : (fila as CuentaPagar).monto_pagado;
                  const estadoVista = vistaEstado(fila.estado, vencida);

                  return (
                    <tr key={fila.id}>
                      <td className="strong">{contraparte}</td>
                      <td className="text-text-secondary">{formatFecha(fila.fecha_creacion)}</td>
                      <td className={vencida ? 'text-danger' : 'text-text-secondary'}>
                        {formatFecha(fila.fecha_vencimiento)}
                      </td>
                      <td className="num">{formatMoney(fila.monto_total)}</td>
                      <td className="num">{formatMoney(abonado)}</td>
                      <td className="num strong text-accent-from">
                        {formatMoney(fila.saldo_pendiente)}
                      </td>
                      <td>
                        <span className={estadoVista.badge}>
                          <estadoVista.Icono size={12} aria-hidden="true" />
                          {estadoVista.label}
                        </span>
                        {vencida && fila.estado !== 'VENCIDA' && (
                          <span className="ml-1 text-body-sm text-text-muted">(vencida)</span>
                        )}
                      </td>
                      <td className="num">
                        {Number(fila.saldo_pendiente) > 0 && fila.estado !== 'ANULADA' ? (
                          <button
                            type="button"
                            className="btn-secondary text-body-sm"
                            onClick={() =>
                              setMovimiento({
                                tipo: esCobrar ? 'cobrar' : 'pagar',
                                cuentaId: fila.id,
                                contraparte,
                                saldoPendiente: Number(fila.saldo_pendiente),
                              })
                            }
                          >
                            {esCobrar ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                            {esCobrar ? 'Abonar' : 'Pagar'}
                          </button>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {!isLoading && filas.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <p className="text-body text-text-secondary">
                      {estado
                        ? 'No hay cuentas con ese estado.'
                        : tab === 'COBRAR'
                          ? 'No hay cuentas por cobrar.'
                          : 'No hay cuentas por pagar.'}
                    </p>
                    <p className="mt-1 text-body-sm text-text-muted">
                      {tab === 'COBRAR'
                        ? 'Cuando vendas a crédito o des de alta una cuenta por cobrar, aparecerá aquí para registrar sus abonos.'
                        : 'Cuando registres un adeudo con un proveedor, aparecerá aquí para registrar sus pagos.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación real con `meta` */}
        <div className="flex items-center justify-between border-t border-border-subtle p-4 text-body-sm text-text-secondary">
          <span>
            Página {meta?.page ?? 1} de {Math.max(1, meta?.totalPages ?? 1)} ·{' '}
            {meta?.total ?? 0} {meta?.total === 1 ? 'cuenta' : 'cuentas'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary text-body-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="btn-secondary text-body-sm"
              disabled={!meta || page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {movimiento && (
        <MovimientoDrawer
          key={`${movimiento.tipo}-${movimiento.cuentaId}`}
          {...movimiento}
          onClose={() => setMovimiento(null)}
        />
      )}

      {altaVisible && (
        <AltaDrawer
          clientes={clientesRes?.data ?? []}
          tabInicial={tab}
          onClose={() => setAltaVisible(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Drawer de abono / pago
// ---------------------------------------------------------------------------
interface MovimientoDrawerProps {
  tipo: 'cobrar' | 'pagar';
  cuentaId: number;
  contraparte: string;
  saldoPendiente: number;
}

const MovimientoDrawer: React.FC<MovimientoDrawerProps & { onClose: () => void }> = ({
  tipo,
  cuentaId,
  contraparte,
  saldoPendiente,
  onClose,
}) => {
  const qc = useQueryClient();
  const esCobrar = tipo === 'cobrar';

  // ⚠️ La key se genera UNA vez, al abrir el drawer: un reintento de red no
  // puede duplicar el abono.
  const [idempotencyKey] = useState(() => nuevaIdempotencyKey());

  const [monto, setMonto] = useState<string>(String(saldoPendiente));
  const [formaPago, setFormaPago] = useState('');
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [errorMonto, setErrorMonto] = useState<string | null>(null);

  const { data: cuentasFinancieras = [], isLoading: cargandoCuentas } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: () => FinanzasService.listar(),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const montoNum = Number(monto);
  const excede = Number.isFinite(montoNum) && montoNum > saldoPendiente;
  const montoInvalido = !Number.isFinite(montoNum) || montoNum <= 0;
  const formIncompleto = !formaPago || !cuentaFinancieraId;
  const bloqueado = montoInvalido || excede || formIncompleto;

  const mutacion = useMovimientoCuentas(tipo, cuentaId, idempotencyKey);

  const enviar = () => {
    setErrorApi(null);
    if (montoInvalido) {
      setErrorMonto('El monto debe ser mayor que cero');
      return;
    }
    if (excede) {
      setErrorMonto('El monto supera el saldo pendiente');
      return;
    }
    if (formIncompleto) {
      setErrorApi('Selecciona la forma de pago y la cuenta financiera.');
      return;
    }
    setErrorMonto(null);

    mutacion.mutate(
      {
        monto: montoNum,
        formaPago,
        cuentaFinancieraId: Number(cuentaFinancieraId),
        referencia: referencia.trim() || undefined,
        notas: notas.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(esCobrar ? 'Abono registrado' : 'Pago registrado');
          qc.invalidateQueries({ queryKey: [CUENTAS_KEY] });
          onClose();
        },
        onError: (err) => setErrorApi(mensajeError(err)),
      },
    );
  };

  /** Enter en cualquier campo del formulario envía, salvo en el textarea. */
  const onKeyDownForm = (e: ReactKeyboardEvent<HTMLFormElement>) => {
    const destino = e.target as HTMLElement;
    if (e.key === 'Enter' && destino.tagName !== 'TEXTAREA' && !bloqueado) {
      e.preventDefault();
      enviar();
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-movimiento"
      >
        <header className="drawer-header">
          <div>
            <h2 id="titulo-movimiento" className="text-h2 text-text-primary">
              {esCobrar ? 'Registrar abono' : 'Registrar pago'}
            </h2>
            <p className="mt-0.5 text-body-sm text-text-secondary">
              {contraparte} · cuenta #{cuentaId}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>

        <div className="drawer-body space-y-4">
          {errorApi && (
            <div className={claseBanner('danger')} role="alert">
              <AlertTriangle size={16} />
              <span>{errorApi}</span>
            </div>
          )}

          <div className="panel flex items-center justify-between p-3">
            <span className="text-body-sm text-text-muted">Saldo pendiente</span>
            <span className="tabular text-body font-bold text-text-primary">
              {formatMoney(saldoPendiente)}
            </span>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
            onKeyDown={onKeyDownForm}
          >
            <div>
              <label htmlFor="mov-monto" className="label">
                Monto a {esCobrar ? 'abonar' : 'pagar'} *
              </label>
              <input
                id="mov-monto"
                className="input tabular"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={saldoPendiente}
                value={monto}
                autoFocus
                aria-invalid={excede || errorMonto !== null}
                onChange={(e) => {
                  setMonto(e.target.value);
                  setErrorMonto(null);
                }}
              />
              {excede ? (
                <p className="field-error">El monto supera el saldo pendiente</p>
              ) : errorMonto ? (
                <p className="field-error">{errorMonto}</p>
              ) : (
                <p className="field-help">
                  Máximo {formatMoney(saldoPendiente)}. Se registra el saldo restante si abonas
                  menos.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="mov-forma-pago" className="label">
                Forma de pago *
              </label>
              <select
                id="mov-forma-pago"
                className="select"
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
              >
                <option value="">Selecciona una forma de pago…</option>
                {FORMAS_PAGO_OPCIONES.map((forma) => (
                  <option key={forma} value={forma}>
                    {forma}
                  </option>
                ))}
              </select>
              {!formaPago && (
                <p className="field-help">
                  Obligatoria: el movimiento queda ligado a la forma en que entró o salió el dinero.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="mov-cuenta-financiera" className="label">
                {esCobrar ? 'Cuenta que recibe' : 'Cuenta que paga'} *
              </label>
              <select
                id="mov-cuenta-financiera"
                className="select"
                value={cuentaFinancieraId}
                disabled={cargandoCuentas}
                onChange={(e) => setCuentaFinancieraId(e.target.value)}
              >
                <option value="">
                  {cargandoCuentas ? 'Cargando cuentas…' : 'Selecciona una cuenta financiera…'}
                </option>
                {cuentasFinancieras.map((cf) => (
                  <option key={cf.id} value={cf.id}>
                    {cf.nombre} · {cf.tipo}
                  </option>
                ))}
              </select>
              {!cargandoCuentas && cuentasFinancieras.length === 0 && (
                <p className="field-error">
                  No hay cuentas financieras activas. Crea una en Finanzas para poder registrar
                  movimientos.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="mov-referencia" className="label">
                Referencia
              </label>
              <input
                id="mov-referencia"
                className="input"
                type="text"
                value={referencia}
                placeholder="Nº de transferencia, voucher…"
                onChange={(e) => setReferencia(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="mov-notas" className="label">
                Notas
              </label>
              <textarea
                id="mov-notas"
                className="textarea"
                rows={3}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>

            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1}>
              Enviar
            </button>
          </form>
        </div>

        <footer className="drawer-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={enviar}
            disabled={mutacion.isPending || bloqueado}
          >
            {mutacion.isPending
              ? 'Guardando…'
              : `${esCobrar ? 'Registrar abono' : 'Registrar pago'} de ${formatMoney(
                  Number.isFinite(montoNum) && montoNum > 0 ? montoNum : 0,
                )}`}
          </button>
        </footer>
      </aside>
    </>
  );
};

// ---------------------------------------------------------------------------
// Drawer de alta de cuenta
// ---------------------------------------------------------------------------
interface ClienteOpcion {
  /** `bigint` en la base → la API devuelve un **number**, no un string. */
  id: number;
  nombre: string;
}

const AltaDrawer: React.FC<{
  clientes: ClienteOpcion[];
  tabInicial: Tab;
  onClose: () => void;
}> = ({ clientes, tabInicial, onClose }) => {
  const qc = useQueryClient();

  const [tipo, setTipo] = useState<Tab>(tabInicial);
  const [clienteId, setClienteId] = useState('');
  const [beneficiario, setBeneficiario] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [notas, setNotas] = useState('');
  const [errorApi, setErrorApi] = useState<string | null>(null);

  const esCobrar = tipo === 'COBRAR';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const montoNum = Number(monto);
  const montoInvalido = !Number.isFinite(montoNum) || montoNum <= 0;
  const contraparteInvalida = esCobrar ? !clienteId : beneficiario.trim().length === 0;

  const mutacion = useAltaCuenta();

  const enviar = () => {
    setErrorApi(null);
    if (contraparteInvalida) {
      setErrorApi(esCobrar ? 'Selecciona el cliente.' : 'Escribe el beneficiario.');
      return;
    }
    if (montoInvalido) {
      setErrorApi('El monto total debe ser mayor que cero.');
      return;
    }
    const comun = {
      montoTotal: montoNum,
      concepto: concepto.trim() || undefined,
      fechaVencimiento: fechaVencimiento
        ? new Date(`${fechaVencimiento}T12:00:00`).toISOString()
        : undefined,
      notas: notas.trim() || undefined,
    };
    mutacion.mutate(
      {
        tipo,
        cobrar: { clienteId: Number(clienteId), ...comun },
        pagar: { beneficiario: beneficiario.trim(), ...comun },
      },
      {
        onSuccess: () => {
          toast.success(esCobrar ? 'Cuenta por cobrar creada' : 'Cuenta por pagar creada');
          qc.invalidateQueries({ queryKey: [CUENTAS_KEY] });
          onClose();
        },
        onError: (err) => setErrorApi(mensajeError(err)),
      },
    );
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="titulo-alta">
        <header className="drawer-header">
          <div>
            <h2 id="titulo-alta" className="text-h2 text-text-primary">
              Nueva cuenta
            </h2>
            <p className="mt-0.5 text-body-sm text-text-secondary">
              Alta manual de un crédito a cliente o de un adeudo con proveedor.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>

        <div className="drawer-body space-y-4">
          {errorApi && (
            <div className={claseBanner('danger')} role="alert">
              <AlertTriangle size={16} />
              <span>{errorApi}</span>
            </div>
          )}

          <div className="flex gap-1">
            <button
              type="button"
              className={esCobrar ? 'btn-secondary flex-1' : 'btn-ghost flex-1'}
              onClick={() => setTipo('COBRAR')}
            >
              <ArrowDownLeft size={14} /> Por cobrar
            </button>
            <button
              type="button"
              className={!esCobrar ? 'btn-secondary flex-1' : 'btn-ghost flex-1'}
              onClick={() => setTipo('PAGAR')}
            >
              <ArrowUpRight size={14} /> Por pagar
            </button>
          </div>

          <hr className="divider" />

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            {esCobrar ? (
              <div>
                <label htmlFor="alta-cliente" className="label">
                  Cliente *
                </label>
                <select
                  id="alta-cliente"
                  className="select"
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                >
                  <option value="">Selecciona un cliente…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {clientes.length === 0 && (
                  <p className="field-help">
                    No se encontraron clientes. Créalos primero en el catálogo de clientes.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor="alta-beneficiario" className="label">
                  Beneficiario *
                </label>
                <input
                  id="alta-beneficiario"
                  className="input"
                  type="text"
                  value={beneficiario}
                  placeholder="Proveedor o acreedor"
                  onChange={(e) => setBeneficiario(e.target.value)}
                />
              </div>
            )}

            <div>
              <label htmlFor="alta-monto" className="label">
                Monto total *
              </label>
              <input
                id="alta-monto"
                className="input tabular"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
              {monto !== '' && montoInvalido && (
                <p className="field-error">El monto total debe ser mayor que cero</p>
              )}
            </div>

            <div>
              <label htmlFor="alta-concepto" className="label">
                Concepto
              </label>
              <input
                id="alta-concepto"
                className="input"
                type="text"
                value={concepto}
                placeholder="Paquete de 5 masajes, compra de insumos…"
                onChange={(e) => setConcepto(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="alta-vencimiento" className="label">
                Fecha de vencimiento
              </label>
              <input
                id="alta-vencimiento"
                className="input"
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
              />
              <p className="field-help">
                Si la dejas vacía, la cuenta no vencerá y no se marcará como vencida.
              </p>
            </div>

            <div>
              <label htmlFor="alta-notas" className="label">
                Notas
              </label>
              <textarea
                id="alta-notas"
                className="textarea"
                rows={3}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </form>
        </div>

        <footer className="drawer-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={enviar}
            disabled={mutacion.isPending || montoInvalido || contraparteInvalida}
          >
            {mutacion.isPending ? 'Creando…' : 'Crear cuenta'}
          </button>
        </footer>
      </aside>
    </>
  );
};

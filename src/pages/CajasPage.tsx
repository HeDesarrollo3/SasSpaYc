// src/pages/CajasPage.tsx
//
// Pantalla de Caja (spec §3.7 de `docs/02-GUIA-FRONTEND.md`).
//
// Reescrita contra el contrato REAL del backend:
//   · Los campos son `saldo_inicial`, `saldo_real` y `concepto` (no `montoInicial`/`montoFinal`/`motivo`).
//   · La caja abierta se pide a `GET /cajas/abierta` (antes se tomaba "la primera de la lista").
//   · El arqueo lo calcula el servidor (`GET /cajas/:id/resumen`); aquí NO se recalcula nada.
//   · Estados en MAYÚSCULAS (`ABIERTA`/`CERRADA`, `INGRESO`/`EGRESO`, `EFECTIVO`/`TARJETA`/`TRANSFERENCIA`).
//   · Todos los importes pasan por `formatMoney()` y las fechas por `lib/format`.

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CircleAlert,
  CircleCheckBig,
  CreditCard,
  Gift,
  Landmark,
  LoaderCircle,
  Lock,
  LockOpen,
  Minus,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import {
  CajasService,
  type Caja,
  type ResumenCaja,
  type TipoMovimientoCaja,
} from '../services/cajas.service';
import { FinanzasService, type CuentaFinanciera } from '../services/finanzas.service';
import { ColaboradoresService } from '../services/colaboradores.service';
import { useAuthStore } from '../stores/auth.store';
import { formatFechaHora, formatHora, formatMoney, formatNumero, round2 } from '../lib/format';
import {
  ESTADO_CAJA,
  FORMA_PAGO,
  FORMAS_PAGO_OPCIONES,
  TIPO_CUENTA_FINANCIERA,
  TIPO_MOVIMIENTO,
  claseBadge,
  claseBanner,
  metaEstado,
} from '../lib/estados';
import type { ApiError } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Claves de TanStack Query (invalidar `['cajas']` cubre cajas, abierta, resumen
// y movimientos de cualquier caja).
// ─────────────────────────────────────────────────────────────────────────────
const KEY_CAJAS = 'cajas';

const QK = {
  cajaAbierta: [KEY_CAJAS, 'abierta'] as const,
  movimientos: (id: number) => [KEY_CAJAS, id, 'movimientos'] as const,
  resumen: (id: number) => [KEY_CAJAS, id, 'resumen'] as const,
  cuentas: ['finanzas', 'cuentas'] as const,
  colaboradores: ['colaboradores', 'caja-apertura'] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Iconos: `lib/estados` devuelve el nombre del ícono como string. Aquí se
// resuelve a componentes reales. ⚠️ `lib/estados` referencia dos nombres que ya
// no existen en esta versión de `lucide-react` (`Unlock`, `Building2`), así que
// se mapean a sus equivalentes actuales (`LockOpen`, `Landmark`). No se toca
// `lib/estados` (está fuera del alcance de esta tarea).
// ─────────────────────────────────────────────────────────────────────────────
const ICONOS: Record<string, LucideIcon> = {
  Lock,
  Unlock: LockOpen,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Building2: Landmark,
};

function IconoEstado({ nombre, size = 14 }: { nombre?: string; size?: number }) {
  if (!nombre) return null;
  const Icono = ICONOS[nombre] ?? Wallet;
  return <Icono size={size} aria-hidden="true" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de la API: `{ error: 'CODIGO', message, statusCode }`.
// Nunca `alert()`: banner por código, con ícono + texto.
// ─────────────────────────────────────────────────────────────────────────────
const AYUDA_ERROR: Record<string, string> = {
  CAJA_CON_PENDIENTES:
    'Cóbralos o anúlalos antes de cerrar: el turno no puede cerrarse con servicios pendientes de cobro.',
  CAJA_YA_ABIERTA: 'Ciérrala antes de abrir una nueva.',
  CAJA_NO_ABIERTA: 'Abre una caja para poder registrar movimientos.',
};

function AvisoError({ error, onDescartar }: { error: unknown; onDescartar?: () => void }) {
  if (!error) return null;

  const e = error as Partial<ApiError>;
  const codigo = e.error ?? 'INTERNAL_ERROR';
  const tono =
    codigo === 'CAJA_CON_PENDIENTES' || codigo === 'CAJA_YA_ABIERTA' ? 'warning' : 'danger';
  const Icono = tono === 'warning' ? TriangleAlert : CircleAlert;

  return (
    <div className={claseBanner(tono)} role="alert">
      <Icono size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-semibold">
          {AYUDA_ERROR[codigo] ?? e.message ?? 'Ocurrió un error inesperado.'}
        </p>
        <p className="mt-0.5 text-body-sm opacity-80">
          {AYUDA_ERROR[codigo] && e.message ? e.message : `Código: ${codigo}`}
        </p>
      </div>
      {onDescartar && (
        <button
          type="button"
          className="btn-icon"
          onClick={onDescartar}
          aria-label="Descartar aviso"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawer (formularios laterales). Esc cierra, como exige la guía de accesibilidad.
// ─────────────────────────────────────────────────────────────────────────────
function Drawer({
  titulo,
  subtitulo,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const alTeclear = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  return (
    <>
      <div className="drawer-backdrop" role="presentation" onClick={onClose} />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="drawer-header">
          <div>
            <h2 className="text-h2 text-text-primary">{titulo}</h2>
            {subtitulo && <p className="mt-1 text-body-sm text-text-secondary">{subtitulo}</p>}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="drawer-body">{children}</div>
          <footer className="drawer-footer">{footer}</footer>
        </form>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas de presentación
// ─────────────────────────────────────────────────────────────────────────────
function EncabezadoPagina() {
  return (
    <PageHeader
      titulo="Caja"
      descripcion="Apertura del turno, movimientos de efectivo y arqueo de cierre."
      icono={Wallet}
    />
  );
}

function Kpi({
  Icono,
  etiqueta,
  valor,
  ayuda,
  claseValor,
}: {
  Icono: LucideIcon;
  etiqueta: string;
  valor: string;
  ayuda?: string;
  claseValor?: string;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-text-muted">
        <Icono size={14} aria-hidden="true" />
        <span className="text-label">{etiqueta}</span>
      </div>
      <p className={`tabular mt-2 text-h1 ${claseValor ?? 'text-text-primary'}`}>{valor}</p>
      {ayuda && <p className="mt-0.5 text-body-sm text-text-muted">{ayuda}</p>}
    </div>
  );
}

function FilaResumen({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span
        className={`text-body-sm ${destacado ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}
      >
        {etiqueta}
      </span>
      <span
        className={`tabular text-body ${destacado ? 'font-bold text-text-primary' : 'text-text-secondary'}`}
      >
        {valor}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A) Sin caja abierta — apertura
// ─────────────────────────────────────────────────────────────────────────────
const aperturaSchema = z.object({
  cuentaFinancieraId: z.string(),
  saldoInicial: z
    .number({ error: 'Ingresa el saldo inicial' })
    .min(0, 'El saldo inicial no puede ser negativo'),
  observaciones: z.string().trim().max(500, 'Máximo 500 caracteres'),
});
type AperturaForm = z.infer<typeof aperturaSchema>;

function PanelApertura({
  cuentas,
  cargandoCuentas,
  colaboradorId,
  onAbierta,
}: {
  cuentas: CuentaFinanciera[];
  cargandoCuentas: boolean;
  colaboradorId?: number;
  onAbierta: (cuenta: { id: number; nombre: string } | null) => void;
}) {
  const qc = useQueryClient();
  const [errorApi, setErrorApi] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<AperturaForm>({
    resolver: zodResolver(aperturaSchema),
    defaultValues: { cuentaFinancieraId: '', saldoInicial: 0, observaciones: '' },
  });

  // `useWatch` (no `watch()`): valor reactivo sin exponer una función que React
  // Compiler no puede memoizar sin arriesgar UI obsoleta (igual que UsuariosPage).
  const cuentaElegida = useWatch({ control, name: 'cuentaFinancieraId' });

  // Preselecciona la primera cuenta de efectivo en cuanto cargan las cuentas.
  useEffect(() => {
    if (cuentas.length === 0) return;
    if (getValues('cuentaFinancieraId')) return;
    const preferida = cuentas.find((c) => c.tipo === 'EFECTIVO') ?? cuentas[0];
    setValue('cuentaFinancieraId', String(preferida.id));
  }, [cuentas, getValues, setValue]);

  const abrir = useMutation({
    mutationFn: (values: AperturaForm) =>
      CajasService.aperturar({
        saldoInicial: values.saldoInicial,
        colaboradorId,
        observaciones: values.observaciones.trim() || undefined,
        cuentaFinancieraId: values.cuentaFinancieraId
          ? Number(values.cuentaFinancieraId)
          : undefined,
      }),
    onSuccess: () => {
      setErrorApi(null);
      const elegida = cuentas.find((c) => String(c.id) === getValues('cuentaFinancieraId')) ?? null;
      onAbierta(elegida ? { id: elegida.id, nombre: elegida.nombre } : null);
      toast.success('Caja abierta. Ya puedes cobrar.');
      qc.invalidateQueries({ queryKey: [KEY_CAJAS] });
    },
    onError: (err) => setErrorApi(err),
  });

  const onSubmit = handleSubmit((values) => abrir.mutate(values));
  const bloqueado = abrir.isPending || (cuentas.length > 0 && !cuentaElegida);

  return (
    <div className="panel mx-auto w-full max-w-md p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
        <TriangleAlert size={24} aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-h2 text-text-primary">No hay caja abierta</h2>
      <p className="mt-1 text-body-sm text-text-secondary">
        Para empezar a cobrar necesitas abrir una caja. Sin una caja abierta el sistema no registra
        cobros ni movimientos de efectivo, y el arqueo del turno queda sin responsable.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4 text-left">
        {errorApi ? <AvisoError error={errorApi} onDescartar={() => setErrorApi(null)} /> : null}

        <div>
          <label htmlFor="apertura-cuenta" className="label">
            Cuenta financiera *
          </label>
          <select
            id="apertura-cuenta"
            className="select"
            disabled={cargandoCuentas || cuentas.length === 0}
            aria-invalid={cuentas.length > 0 && !cuentaElegida}
            aria-describedby="apertura-cuenta-help"
            {...register('cuentaFinancieraId')}
          >
            {cuentas.length === 0 && <option value="">Sin cuentas financieras activas</option>}
            {cuentas.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.nombre} · {metaEstado(TIPO_CUENTA_FINANCIERA, c.tipo).label}
              </option>
            ))}
          </select>
          <p id="apertura-cuenta-help" className="field-help">
            {cuentas.length === 0
              ? 'No hay cuentas activas: créalas en «Cuentas financieras». Puedes abrir la caja igualmente.'
              : 'Cuenta desde la que se abre el turno. Identifica el origen del efectivo del arqueo.'}
          </p>
        </div>

        <div>
          <label htmlFor="apertura-saldo" className="label">
            Saldo inicial *
          </label>
          <input
            id="apertura-saldo"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="input tabular"
            aria-invalid={!!errors.saldoInicial}
            aria-describedby="apertura-saldo-help"
            {...register('saldoInicial', { valueAsNumber: true })}
          />
          <p id="apertura-saldo-help" className="field-help">
            Efectivo con el que arranca el cajón.
          </p>
          {errors.saldoInicial && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.saldoInicial.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="apertura-obs" className="label">
            Observaciones
          </label>
          <textarea
            id="apertura-obs"
            rows={2}
            className="textarea"
            placeholder="Ej.: turno de la mañana, relevo de Ana"
            {...register('observaciones')}
          />
          {errors.observaciones && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.observaciones.message}
            </p>
          )}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={bloqueado}>
          {abrir.isPending ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <LockOpen size={16} aria-hidden="true" />
          )}
          Abrir caja
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// C) Drawer de ingreso / egreso (un solo componente, `tipoMovimiento` como prop)
// ─────────────────────────────────────────────────────────────────────────────
const movimientoSchema = z.object({
  monto: z.number({ error: 'Ingresa el monto' }).min(0.01, 'El monto debe ser mayor que cero'),
  concepto: z
    .string()
    .trim()
    .min(1, 'El concepto es obligatorio')
    .max(200, 'Máximo 200 caracteres'),
  formaPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'], {
    error: 'Selecciona la forma de pago',
  }),
  observaciones: z.string().trim().max(500, 'Máximo 500 caracteres'),
});
type MovimientoForm = z.infer<typeof movimientoSchema>;

function DrawerMovimiento({
  cajaId,
  tipoMovimiento,
  esperadoEfectivo,
  colaboradorId,
  onClose,
}: {
  cajaId: number;
  tipoMovimiento: TipoMovimientoCaja;
  esperadoEfectivo: number;
  colaboradorId?: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [errorApi, setErrorApi] = useState<unknown>(null);
  const esIngreso = tipoMovimiento === 'INGRESO';

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<MovimientoForm>({
    resolver: zodResolver(movimientoSchema),
    defaultValues: { monto: undefined, concepto: '', formaPago: 'EFECTIVO', observaciones: '' },
  });

  // `useWatch` en lugar de `watch()` (React Compiler: ver UsuariosPage).
  const montoIngresado = useWatch({ control, name: 'monto' });
  const montoActual = Number(montoIngresado);

  const registrar = useMutation({
    mutationFn: (values: MovimientoForm) =>
      CajasService.registrarMovimiento({
        cajaId,
        tipoMovimiento,
        monto: values.monto,
        concepto: values.concepto.trim(),
        formaPago: values.formaPago,
        colaboradorId,
        observaciones: values.observaciones.trim() || undefined,
      }),
    onSuccess: (_data, values) => {
      toast.success(
        `${esIngreso ? 'Ingreso' : 'Egreso'} de ${formatMoney(values.monto)} registrado en la caja.`,
      );
      qc.invalidateQueries({ queryKey: [KEY_CAJAS] });
      onClose();
    },
    onError: (err) => setErrorApi(err),
  });

  const onSubmit = handleSubmit((values) => registrar.mutate(values));
  const excedeEfectivo =
    !esIngreso && Number.isFinite(montoActual) && montoActual > esperadoEfectivo;

  return (
    <Drawer
      titulo={esIngreso ? 'Registrar ingreso' : 'Registrar egreso'}
      subtitulo={
        esIngreso
          ? 'Entra efectivo que no proviene de una venta (aporte, cambio de fondo…).'
          : 'Sale efectivo de la caja (insumos, proveedor, retiro…).'
      }
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={registrar.isPending}>
            {registrar.isPending ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : esIngreso ? (
              <ArrowDownLeft size={16} aria-hidden="true" />
            ) : (
              <ArrowUpRight size={16} aria-hidden="true" />
            )}
            {esIngreso ? 'Registrar ingreso' : 'Registrar egreso'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {errorApi ? <AvisoError error={errorApi} onDescartar={() => setErrorApi(null)} /> : null}

        {excedeEfectivo && (
          <div className={claseBanner('warning')} role="status">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Este egreso supera el efectivo esperado en caja.</p>
              <p className="mt-0.5">
                Esperado en efectivo {formatMoney(esperadoEfectivo)} · egreso{' '}
                {formatMoney(montoActual)}. El arqueo quedará en faltante.
              </p>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="mov-monto" className="label">
            Monto *
          </label>
          <input
            id="mov-monto"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            className="input tabular text-body font-bold"
            aria-invalid={!!errors.monto}
            {...register('monto', { valueAsNumber: true })}
          />
          {errors.monto && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.monto.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="mov-concepto" className="label">
            Concepto *
          </label>
          <input
            id="mov-concepto"
            type="text"
            className="input"
            placeholder={esIngreso ? 'Ej.: aporte de fondo' : 'Ej.: compra de insumos de limpieza'}
            aria-invalid={!!errors.concepto}
            {...register('concepto')}
          />
          {errors.concepto && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.concepto.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="mov-forma" className="label">
            Forma de pago *
          </label>
          <select
            id="mov-forma"
            className="select"
            aria-invalid={!!errors.formaPago}
            {...register('formaPago')}
          >
            {FORMAS_PAGO_OPCIONES.map((f) => (
              <option key={f} value={f}>
                {metaEstado(FORMA_PAGO, f).label}
              </option>
            ))}
          </select>
          <p className="field-help">
            Obligatoria: el esperado en efectivo del arqueo se desglosa por forma de pago.
          </p>
          {errors.formaPago && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.formaPago.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="mov-obs" className="label">
            Observaciones
          </label>
          <textarea
            id="mov-obs"
            rows={2}
            className="textarea"
            placeholder="Referencia, comprobante o nota interna"
            {...register('observaciones')}
          />
          {errors.observaciones && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.observaciones.message}
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// D) Drawer de cierre (arqueo) — la pantalla más importante de la caja
// ─────────────────────────────────────────────────────────────────────────────
const cierreSchema = z.object({
  saldoReal: z
    .number({ error: 'Ingresa el efectivo contado' })
    .min(0, 'El monto contado no puede ser negativo'),
  observaciones: z.string().trim().max(500, 'Máximo 500 caracteres'),
});
type CierreForm = z.infer<typeof cierreSchema>;

function DrawerCierre({
  caja,
  resumen,
  colaboradorId,
  onClose,
}: {
  caja: Caja;
  resumen: ResumenCaja;
  colaboradorId?: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [errorApi, setErrorApi] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<CierreForm>({
    resolver: zodResolver(cierreSchema),
    defaultValues: { saldoReal: undefined, observaciones: '' },
  });

  // `useWatch` en lugar de `watch()` (React Compiler: ver UsuariosPage).
  const contado = useWatch({ control, name: 'saldoReal' });
  const observaciones = useWatch({ control, name: 'observaciones' }) ?? '';

  const contadoNum = Number(contado);
  const contadoValido = contado !== undefined && contado !== null && Number.isFinite(contadoNum);
  // Diferencia calculada EN VIVO: contado − esperado en efectivo (cálculo del servidor).
  const diferencia = contadoValido ? round2(contadoNum - resumen.esperado.EFECTIVO) : null;
  const exigeObservaciones = diferencia !== null && diferencia !== 0;
  const faltaObservaciones = exigeObservaciones && observaciones.trim().length === 0;

  const cerrar = useMutation({
    mutationFn: (input: { saldoReal: number; observaciones: string }) =>
      CajasService.cerrar(caja.id, {
        saldoReal: input.saldoReal,
        colaboradorId,
        observaciones: input.observaciones.trim() || undefined,
      }),
    onSuccess: (_data, input) => {
      const dif = round2(input.saldoReal - resumen.esperado.EFECTIVO);
      const etiqueta = dif === 0 ? 'Cuadre exacto' : dif > 0 ? 'Sobrante' : 'Faltante';
      toast.success(
        `Caja cerrada · Esperado ${formatMoney(resumen.esperado.EFECTIVO)} · Contado ${formatMoney(
          input.saldoReal,
        )} · ${etiqueta} ${formatMoney(dif, { signo: true })}`,
      );
      qc.invalidateQueries({ queryKey: [KEY_CAJAS] });
      onClose();
    },
    onError: (err) => setErrorApi(err),
  });

  const onSubmit = handleSubmit((values) => {
    if (faltaObservaciones) {
      setError('observaciones', {
        type: 'required',
        message: 'Explica el motivo de la diferencia: es obligatorio cuando el arqueo no cuadra.',
      });
      return;
    }
    cerrar.mutate({ saldoReal: values.saldoReal, observaciones: values.observaciones });
  });

  const puedeConfirmar =
    contadoValido && !faltaObservaciones && resumen.puede_cerrar && !cerrar.isPending;

  const tonoDiferencia =
    diferencia === 0 ? 'success' : diferencia !== null && diferencia > 0 ? 'warning' : 'danger';
  const IconoDiferencia =
    diferencia === 0
      ? CircleCheckBig
      : diferencia !== null && diferencia > 0
        ? TrendingUp
        : TriangleAlert;
  const etiquetaDiferencia =
    diferencia === 0
      ? 'Cuadre exacto'
      : diferencia !== null && diferencia > 0
        ? 'Sobrante'
        : 'Faltante';

  return (
    <Drawer
      titulo="Cerrar caja"
      subtitulo={`Arqueo del turno abierto el ${formatFechaHora(caja.fecha_apertura)}`}
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={!puedeConfirmar}>
            {cerrar.isPending ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Lock size={16} aria-hidden="true" />
            )}
            Cerrar caja
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {errorApi ? <AvisoError error={errorApi} onDescartar={() => setErrorApi(null)} /> : null}

        {/* Resumen del turno — sólo lectura, todo viene de `GET /cajas/:id/resumen` */}
        <section className="panel p-4">
          <h3 className="text-label text-text-muted">Resumen del turno</h3>
          <div className="mt-2">
            <FilaResumen etiqueta="Saldo inicial" valor={formatMoney(resumen.saldo_inicial)} />
            <FilaResumen
              etiqueta="Ventas e ingresos en efectivo"
              valor={formatMoney(resumen.movimientos.ingresos.EFECTIVO)}
            />
            <FilaResumen
              etiqueta="Ingresos por tarjeta"
              valor={formatMoney(resumen.movimientos.ingresos.TARJETA)}
            />
            <FilaResumen
              etiqueta="Ingresos por transferencia"
              valor={formatMoney(resumen.movimientos.ingresos.TRANSFERENCIA)}
            />
            <FilaResumen
              etiqueta="Egresos en efectivo"
              valor={formatMoney(-resumen.movimientos.egresos.EFECTIVO)}
            />
            <FilaResumen
              etiqueta="Egresos por tarjeta y transferencia"
              valor={formatMoney(
                -(resumen.movimientos.egresos.TARJETA + resumen.movimientos.egresos.TRANSFERENCIA),
              )}
            />
            <FilaResumen etiqueta="Propinas" valor={formatMoney(resumen.propinas)} />
          </div>

          <hr className="divider my-3" />

          <div className="rounded-sm border border-border-strong bg-surface-card p-3">
            <p className="text-label text-text-muted">ESPERADO EN EFECTIVO</p>
            <p className="tabular mt-1 text-h1 text-text-primary">
              {formatMoney(resumen.esperado.EFECTIVO)}
            </p>
            <p className="mt-1 text-body-sm text-text-muted">
              Tarjeta {formatMoney(resumen.esperado.TARJETA)} · Transferencia{' '}
              {formatMoney(resumen.esperado.TRANSFERENCIA)} — aparte, no se cuentan en el cajón.
            </p>
          </div>

          <p className="mt-2 text-body-sm text-text-muted">
            {formatNumero(resumen.movimientos_cantidad)} movimientos registrados en esta caja.
          </p>
        </section>

        <div>
          <label htmlFor="cierre-contado" className="label">
            Contado en caja *
          </label>
          <input
            id="cierre-contado"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="input tabular text-body font-bold"
            aria-invalid={!!errors.saldoReal}
            aria-describedby="cierre-contado-help"
            {...register('saldoReal', { valueAsNumber: true })}
          />
          <p id="cierre-contado-help" className="field-help">
            Efectivo físico contado en el cajón, no lo que esperas tener.
          </p>
          {errors.saldoReal && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.saldoReal.message}
            </p>
          )}
        </div>

        {/* Diferencia en vivo */}
        {diferencia !== null && (
          <div className={claseBanner(tonoDiferencia)} role="status" aria-live="polite">
            <IconoDiferencia size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {etiquetaDiferencia} · {formatMoney(diferencia, { signo: true })}
              </p>
              <p className="mt-0.5">
                Contado {formatMoney(contadoNum)} − esperado en efectivo{' '}
                {formatMoney(resumen.esperado.EFECTIVO)}
              </p>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="cierre-obs" className="label">
            Observaciones {exigeObservaciones ? <span className="text-danger">*</span> : null}
          </label>
          <textarea
            id="cierre-obs"
            rows={3}
            className="textarea"
            placeholder={
              exigeObservaciones
                ? 'Obligatorio: explica por qué el arqueo no cuadra'
                : 'Notas del cierre (opcional)'
            }
            aria-invalid={faltaObservaciones}
            aria-describedby="cierre-obs-help"
            {...register('observaciones')}
          />
          <p id="cierre-obs-help" className="field-help">
            {exigeObservaciones
              ? 'El arqueo tiene diferencia: describe el motivo antes de cerrar.'
              : 'Obligatorio sólo si el arqueo presenta diferencia.'}
          </p>
          {faltaObservaciones && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> Explica el motivo de la diferencia: es
              obligatorio cuando el arqueo no cuadra.
            </p>
          )}
          {errors.observaciones && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.observaciones.message}
            </p>
          )}
        </div>

        {!resumen.puede_cerrar && (
          <div className={claseBanner('warning')} role="status">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>Sólo se puede cerrar una caja en estado ABIERTA. Estado actual: {caja.estado}.</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────
export function CajasPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  // `usuarios.colaborador_id` todavía no existe en la BD (migración 001 pendiente),
  // así que el tipo `AuthUser` del store no lo declara: se lee de forma defensiva
  // sin tocar `src/types/auth.types.ts` (compartido con otras pantallas).
  const colaboradorId =
    (user as unknown as { colaborador_id?: number | null } | null)?.colaborador_id ?? undefined;

  const [drawerMovimiento, setDrawerMovimiento] = useState<TipoMovimientoCaja | null>(null);
  const [cierreAbierto, setCierreAbierto] = useState(false);
  const [cuentaApertura, setCuentaApertura] = useState<{ id: number; nombre: string } | null>(null);

  // ── Caja abierta ───────────────────────────────────────────────────────────
  const cajaAbierta = useQuery({
    queryKey: QK.cajaAbierta,
    queryFn: () => CajasService.obtenerAbierta(),
    refetchInterval: 30_000,
  });

  const caja = cajaAbierta.data ?? null;
  const cajaId = caja?.id ?? 0;

  // ── Arqueo en vivo (el cálculo es del servidor) ────────────────────────────
  const resumenQuery = useQuery({
    queryKey: QK.resumen(cajaId),
    queryFn: () => CajasService.obtenerResumen(cajaId),
    enabled: cajaId > 0,
    refetchInterval: 30_000,
  });
  const resumen = resumenQuery.data;

  // ── Movimientos de la caja ─────────────────────────────────────────────────
  const movimientosQuery = useQuery({
    queryKey: QK.movimientos(cajaId),
    queryFn: () => CajasService.listarMovimientos(cajaId, 1, 100),
    enabled: cajaId > 0,
  });
  const movimientos = movimientosQuery.data?.data ?? [];

  // ── Catálogos auxiliares ───────────────────────────────────────────────────
  const cuentasQuery = useQuery({
    queryKey: QK.cuentas,
    queryFn: () => FinanzasService.listar(),
    staleTime: 5 * 60_000,
  });

  const colaboradoresQuery = useQuery({
    queryKey: QK.colaboradores,
    queryFn: () => ColaboradoresService.listar({ limit: 100 }),
    enabled: (caja?.colaborador_apertura_id ?? null) !== null,
    staleTime: 5 * 60_000,
  });

  const nombreApertura = caja?.colaborador_apertura_id
    ? colaboradoresQuery.data?.data.find((c) => c.id === caja.colaborador_apertura_id)?.nombre
    : undefined;

  const quienAbrio = caja?.colaborador_apertura_id
    ? (nombreApertura ?? `Colaborador #${caja.colaborador_apertura_id}`)
    : 'sin colaborador registrado';

  // ── Estado de carga / error de la consulta principal ───────────────────────
  if (cajaAbierta.isLoading) {
    return (
      <div className="page-container space-y-6">
        <EncabezadoPagina />
        <div className="panel p-6">
          <div className="skeleton h-6 w-56" />
          <div className="skeleton mt-3 h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel p-4">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton mt-3 h-6 w-28" />
            </div>
          ))}
        </div>
        <div className="panel p-6">
          <div className="skeleton mb-3 h-4 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton mb-2 h-8 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (cajaAbierta.isError) {
    return (
      <div className="page-container space-y-6">
        <EncabezadoPagina />
        <AvisoError error={cajaAbierta.error} />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => cajaAbierta.refetch()}
          disabled={cajaAbierta.isFetching}
        >
          {cajaAbierta.isFetching ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={16} aria-hidden="true" />
          )}
          Reintentar
        </button>
      </div>
    );
  }

  // ── A) Sin caja abierta ────────────────────────────────────────────────────
  if (!caja) {
    return (
      <div className="page-container space-y-6">
        <EncabezadoPagina />
        <PanelApertura
          cuentas={cuentasQuery.data ?? []}
          cargandoCuentas={cuentasQuery.isLoading}
          colaboradorId={colaboradorId}
          onAbierta={setCuentaApertura}
        />
      </div>
    );
  }

  // ── B) Con caja abierta ────────────────────────────────────────────────────
  const metaCaja = metaEstado(ESTADO_CAJA, caja.estado);
  // La cuenta del turno se guarda en `cajas.cuenta_financiera_id` (desde la 026).
  const cuentaDelTurno = (cuentasQuery.data ?? []).find((c) => c.id === caja.cuenta_financiera_id);
  const nombreCuenta = cuentaDelTurno?.nombre ?? cuentaApertura?.nombre ?? 'Caja del turno';
  const puedeCerrar = resumen?.puede_cerrar === true;
  const motivoBloqueoCierre = resumen
    ? resumen.puede_cerrar
      ? undefined
      : `Sólo se puede cerrar una caja en estado ABIERTA. Estado actual: ${caja.estado}.`
    : resumenQuery.isError
      ? 'No se pudo cargar el arqueo de la caja. Reintenta antes de cerrar: cerrar sin arqueo deja el turno sin cuadre.'
      : 'Cargando el arqueo de la caja…';

  return (
    <div className="page-container space-y-6">
      <EncabezadoPagina />

      {/* Encabezado de la caja abierta */}
      <header className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2
                className="text-h2 text-text-primary"
                title="Cuenta de efectivo del turno: los ingresos y egresos en efectivo mueven su saldo."
              >
                {nombreCuenta}
              </h2>
              <span className={claseBadge(metaCaja.tono)}>
                <IconoEstado nombre={metaCaja.icono} />
                {metaCaja.label}
              </span>
            </div>
            <p className="text-body-sm text-text-secondary">
              Abierta el{' '}
              <span className="text-text-primary">{formatFechaHora(caja.fecha_apertura)}</span>
              {caja.colaborador_apertura_id ? (
                <>
                  {' '}
                  por <span className="text-text-primary">{quienAbrio}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDrawerMovimiento('INGRESO')}
            >
              <Plus size={16} aria-hidden="true" /> Ingreso
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDrawerMovimiento('EGRESO')}
            >
              <Minus size={16} aria-hidden="true" /> Egreso
            </button>
            <button
              type="button"
              className="btn-primary"
              title={motivoBloqueoCierre}
              aria-describedby={motivoBloqueoCierre ? 'motivo-cierre' : undefined}
              disabled={!puedeCerrar}
              onClick={() => setCierreAbierto(true)}
            >
              <Lock size={16} aria-hidden="true" /> Cerrar caja
            </button>
          </div>
        </div>

        {motivoBloqueoCierre && (
          <p id="motivo-cierre" className="field-help mt-3">
            <TriangleAlert size={14} className="mr-1 inline" aria-hidden="true" />
            {motivoBloqueoCierre}
          </p>
        )}
      </header>

      {resumen ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              Icono={Banknote}
              etiqueta="Saldo inicial"
              valor={formatMoney(resumen.saldo_inicial)}
              ayuda="Fondo con el que se abrió el turno"
            />
            <Kpi
              Icono={TrendingUp}
              etiqueta="Ventas / movimientos"
              valor={formatMoney(resumen.movimientos.ingresos.total)}
              ayuda={`${formatNumero(resumen.movimientos.ingresos.cantidad)} ingresos registrados`}
              claseValor="text-success"
            />
            <Kpi
              Icono={TrendingDown}
              etiqueta="Movimientos egresos"
              valor={formatMoney(-resumen.movimientos.egresos.total)}
              ayuda={`${formatNumero(resumen.movimientos.egresos.cantidad)} egresos registrados`}
              claseValor="text-danger"
            />
            <Kpi
              Icono={Gift}
              etiqueta="Propinas"
              valor={formatMoney(resumen.propinas)}
              ayuda="No forman parte de las ventas"
            />
          </div>

          {/* Esperado en efectivo */}
          <section className="panel p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-label text-text-muted">ESPERADO EN EFECTIVO</p>
                <p className="tabular text-gradient mt-1 text-display">
                  {formatMoney(resumen.esperado.EFECTIVO)}
                </p>
              </div>
              <p className="text-body-sm text-text-secondary">
                Tarjeta{' '}
                <span className="tabular text-text-primary">
                  {formatMoney(resumen.esperado.TARJETA)}
                </span>{' '}
                · Transferencia{' '}
                <span className="tabular text-text-primary">
                  {formatMoney(resumen.esperado.TRANSFERENCIA)}
                </span>{' '}
                · Total del turno{' '}
                <span className="tabular text-text-primary">
                  {formatMoney(resumen.esperado.total)}
                </span>
              </p>
            </div>
          </section>
        </>
      ) : resumenQuery.isError ? (
        <section className="panel space-y-3 p-5">
          <AvisoError error={resumenQuery.error} />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => resumenQuery.refetch()}
            disabled={resumenQuery.isFetching}
          >
            {resumenQuery.isFetching ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw size={16} aria-hidden="true" />
            )}
            Reintentar arqueo
          </button>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="panel p-4">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton mt-3 h-6 w-28" />
              </div>
            ))}
          </div>
          <section className="panel p-5">
            <div className="skeleton h-16 w-full" />
          </section>
        </>
      )}

      {/* Movimientos */}
      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-5">
          <div>
            <h2 className="text-h2 text-text-primary">Movimientos del día</h2>
            <p className="mt-0.5 text-body-sm text-text-muted">
              Todo lo que entró y salió de esta caja, del más reciente al más antiguo.
            </p>
          </div>
          <span className="badge badge-neutral">
            {formatNumero(movimientos.length)} movimientos
          </span>
        </header>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">Concepto</th>
                <th scope="col">Forma de pago</th>
                <th scope="col">Tipo</th>
                <th scope="col" className="num">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody>
              {movimientosQuery.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5}>
                      <div className="skeleton h-5 w-full" />
                    </td>
                  </tr>
                ))}

              {!movimientosQuery.isLoading &&
                movimientos.map((m) => {
                  const meta = metaEstado(TIPO_MOVIMIENTO, m.tipo_movimiento);
                  const forma = m.forma_pago ? metaEstado(FORMA_PAGO, m.forma_pago) : null;
                  const esIngreso = m.tipo_movimiento === 'INGRESO';
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{formatHora(m.fecha_hora)}</td>
                      <td className="strong">{m.concepto}</td>
                      <td>
                        {forma ? (
                          <span className={claseBadge(forma.tono)}>
                            <IconoEstado nombre={forma.icono} />
                            {forma.label}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className={claseBadge(meta.tono)}>
                          <IconoEstado nombre={meta.icono} />
                          {meta.label}
                        </span>
                      </td>
                      <td
                        className={`num font-semibold ${esIngreso ? 'text-success' : 'text-danger'}`}
                      >
                        {esIngreso
                          ? formatMoney(m.monto, { signo: true })
                          : formatMoney(-Number(m.monto))}
                      </td>
                    </tr>
                  );
                })}

              {!movimientosQuery.isLoading && movimientos.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center">
                    <p className="text-text-secondary">Aún no hay movimientos en esta caja.</p>
                    <p className="mt-1 text-body-sm text-text-muted">
                      Usa «Ingreso» o «Egreso» cuando entre o salga efectivo. Los cobros aparecerán
                      aquí automáticamente.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Drawers */}
      {drawerMovimiento && resumen && (
        <DrawerMovimiento
          cajaId={caja.id}
          tipoMovimiento={drawerMovimiento}
          esperadoEfectivo={resumen.esperado.EFECTIVO}
          colaboradorId={colaboradorId}
          onClose={() => setDrawerMovimiento(null)}
        />
      )}

      {cierreAbierto && resumen && (
        <DrawerCierre
          caja={caja}
          resumen={resumen}
          colaboradorId={colaboradorId}
          onClose={() => {
            setCierreAbierto(false);
            // Un cierre pudo completarse: deja el arqueo fresco por si la caja sigue abierta.
            qc.invalidateQueries({ queryKey: [KEY_CAJAS] });
          }}
        />
      )}
    </div>
  );
}

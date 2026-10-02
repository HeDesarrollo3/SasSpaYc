// src/pages/LiquidacionesPage.tsx
//
// Liquidaciones de colaboradores (spec §3.9 de `docs/02-GUIA-FRONTEND.md`).
//
// Contrato real (`src/services/liquidaciones.service.ts`): campos en
// **snake_case**, ids numéricos, listado paginado con `{ data, meta }` y detalle
// con `detalles` + `pagos` en el mismo objeto.
//
// Decisiones de dinero y de estado:
//   · El **saldo NO lo devuelve el backend**: es `total_pagar − monto_pagado` y se
//     calcula aquí para mostrarlo destacado.
//   · `total_ventas` es la **base** (importe) sobre la que se liquidó. La cantidad
//     de ventas es `detalles.length`.
//   · Los estados salen de `ESTADO_LIQUIDACION`; si llega uno desconocido,
//     `metaEstado()` cae a un badge neutro con el texto crudo y la pantalla lo
//     deja visible en vez de romper.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Ban,
  Banknote,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  FileText,
  HandCoins,
  Landmark,
  LoaderCircle,
  Printer,
  Receipt,
  RefreshCw,
  ThumbsUp,
  TriangleAlert,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  LiquidacionesService,
  type ComisionPendiente,
  type LiquidacionCompleta,
  type LiquidacionDetalle,
  type PagoColaborador,
} from '../services/liquidaciones.service';
import { ColaboradoresService } from '../services/colaboradores.service';
import { FinanzasService } from '../services/finanzas.service';
import { nuevaIdempotencyKey } from '../services/api';
import {
  aISODate,
  formatFechaHora,
  formatMoney,
  formatNumero,
  formatPeriodo,
  formatPorcentaje,
  lunesDe,
  rangoSemana,
} from '../lib/format';
import {
  ESTADO_LIQUIDACION,
  FORMA_PAGO,
  FORMAS_PAGO_OPCIONES,
  claseBadge,
  claseBanner,
  metaEstado,
} from '../lib/estados';
import { PageHeader } from '../components/PageHeader';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes y utilidades locales
// ─────────────────────────────────────────────────────────────────────────────

/** Invalidar `['liquidaciones']` cubre el listado y todos los detalles. */
const KEY_LIQUIDACIONES = 'liquidaciones';
const KEY_COLABORADORES = 'colaboradores';
const KEY_PENDIENTES = 'liquidaciones-pendientes';
const KEY_FINANZAS = 'finanzas';

type Meta = { page: number; limit: number; total: number; totalPages: number };

/** Sólo se necesita id + nombre para los selectores y para resolver la tabla. */
type OpcionColaborador = { id: number; nombre: string };

const OPCIONES_ESTADO = Object.keys(ESTADO_LIQUIDACION) as (keyof typeof ESTADO_LIQUIDACION)[];

/**
 * `lib/estados` devuelve el nombre del ícono como string. Aquí se resuelve con un
 * mapa **tipado por estado** cuyos valores son componentes importados de
 * `lucide-react` (nunca un nombre por string).
 *
 * ⚠️ `CajasPage` documenta que `lib/estados` referencia `Building2`, que no
 * existe en esta versión de `lucide-react`; para `TRANSFERENCIA` se usa su
 * equivalente actual (`Landmark`).
 */
const ICONOS_ESTADO: Record<keyof typeof ESTADO_LIQUIDACION, LucideIcon> = {
  PENDIENTE: FileText,
  APROBADA: ThumbsUp,
  PAGADA: CheckCircle2,
  ANULADA: Ban,
};

const ICONOS_FORMA_PAGO: Record<keyof typeof FORMA_PAGO, LucideIcon> = {
  EFECTIVO: Banknote,
  TARJETA: CreditCard,
  TRANSFERENCIA: Landmark,
};

function esClaveConocida<T extends Record<string, unknown>>(
  mapa: T,
  valor: string,
): valor is keyof T & string {
  return Object.prototype.hasOwnProperty.call(mapa, valor);
}

/** Códigos que no son un fallo del usuario: se muestran como aviso ámbar. */
const CODIGOS_AVISO = ['DUPLICATE_ENTRY', 'CAJA_NO_ABIERTA', 'LIQUIDACION_YA_PAGADA'] as const;

/** Qué significa cada código de error del backend y qué hacer al respecto. */
const AYUDA_ERROR: Record<string, string> = {
  DUPLICATE_ENTRY:
    'Ese periodo ya está liquidado para este colaborador. Anula la liquidación existente si necesitas rehacerla.',
  PERIODO_INVALIDO: 'La fecha de fin del periodo no puede ser anterior a la de inicio.',
  INVALID_STATE:
    'La liquidación no está en un estado que permita esa acción. Actualiza el detalle y vuelve a intentarlo.',
  MONTO_EXCEDE_SALDO: 'El monto supera el saldo pendiente de la liquidación.',
  CAJA_NO_ABIERTA: 'No hay caja abierta: para pagar en efectivo primero hay que abrir la caja.',
  LIQUIDACION_YA_PAGADA:
    'Esta liquidación ya está pagada por completo: no admite más pagos ni anulaciones.',
  NOT_FOUND: 'La liquidación ya no existe. Actualiza la lista.',
  VALIDATION_ERROR: 'Revisa los datos: monto, forma de pago y cuenta financiera son obligatorios.',
};

/** Lunes y domingo de la semana anterior, en `YYYY-MM-DD`. */
function rangoSemanaPasada(): { inicio: string; fin: string } {
  const lunesActual = lunesDe(new Date());
  const lunesAnterior = new Date(lunesActual);
  lunesAnterior.setDate(lunesAnterior.getDate() - 7);
  const { inicio, fin } = rangoSemana(lunesAnterior);
  return { inicio: aISODate(inicio), fin: aISODate(fin) };
}

/** Nombre del colaborador; `#id` si no está en la lista de activos. */
function nombreDeColaborador(colaboradores: OpcionColaborador[], id: number): string {
  return colaboradores.find((c) => c.id === id)?.nombre ?? `#${id}`;
}

/** Saldo pendiente: el backend NO lo devuelve, se calcula en el cliente. */
function saldoDe(liquidacion: { total_pagar: number; monto_pagado: number }): number {
  return Number(liquidacion.total_pagar) - Number(liquidacion.monto_pagado);
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas de presentación
// ─────────────────────────────────────────────────────────────────────────────

function BadgeEstado({ estado }: { estado: string }) {
  const meta = metaEstado(ESTADO_LIQUIDACION, estado);
  const Icono = esClaveConocida(ESTADO_LIQUIDACION, estado) ? ICONOS_ESTADO[estado] : Receipt;
  return (
    <span className={claseBadge(meta.tono)}>
      <Icono size={12} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function BadgeFormaPago({ forma }: { forma: string }) {
  const meta = metaEstado(FORMA_PAGO, forma);
  const Icono = esClaveConocida(FORMA_PAGO, forma) ? ICONOS_FORMA_PAGO[forma] : Wallet;
  return (
    <span className={claseBadge(meta.tono)}>
      <Icono size={12} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** Banner de error de la API, por código y con ícono + texto. Nunca `alert()`. */
function AvisoApi({ error, onDescartar }: { error: unknown; onDescartar?: () => void }) {
  if (!error) return null;

  const e = error as { error?: string; message?: string } | null;
  const codigo = e?.error ?? 'INTERNAL_ERROR';
  const tono = (CODIGOS_AVISO as readonly string[]).includes(codigo) ? 'warning' : 'danger';
  const Icono = tono === 'warning' ? TriangleAlert : CircleAlert;
  const ayuda = AYUDA_ERROR[codigo];

  return (
    <div className={claseBanner(tono)} role="alert">
      <Icono size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-semibold">
          {ayuda ?? e?.message ?? 'No se pudo completar la operación.'}
        </p>
        {ayuda && e?.message && <p className="mt-0.5 text-body-sm opacity-80">{e.message}</p>}
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

function FilaTotal({
  etiqueta,
  valor,
  destacado = false,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  ayuda?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-body-sm text-text-secondary">
        {etiqueta}
        {ayuda && <span className="ml-1 text-text-muted">· {ayuda}</span>}
      </span>
      <span
        className={`tabular text-body ${destacado ? 'font-bold text-text-primary' : 'text-text-secondary'}`}
      >
        {valor}
      </span>
    </div>
  );
}

/**
 * Drawer lateral. Esc cierra (salvo cuando hay otro drawer encima, `cerrarConEsc`
 * en `false`), como el resto de la aplicación.
 */
function Drawer({
  titulo,
  subtitulo,
  onClose,
  onSubmit,
  footer,
  children,
  cerrarConEsc = true,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  onClose: () => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  footer: ReactNode;
  children: ReactNode;
  cerrarConEsc?: boolean;
}) {
  useEffect(() => {
    if (!cerrarConEsc) return;
    const alTeclear = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose, cerrarConEsc]);

  const cuerpo = <div className="drawer-body">{children}</div>;

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

        {onSubmit ? (
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            {cuerpo}
            <footer className="drawer-footer">{footer}</footer>
          </form>
        ) : (
          <>
            {cuerpo}
            <footer className="drawer-footer">{footer}</footer>
          </>
        )}
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A) Drawer "Generar liquidación"
// ─────────────────────────────────────────────────────────────────────────────

const generarSchema = z
  .object({
    colaboradorId: z.string().min(1, 'Selecciona el colaborador'),
    periodoInicio: z.string().min(1, 'Indica la fecha de inicio del periodo'),
    periodoFin: z.string().min(1, 'Indica la fecha de fin del periodo'),
    /**
     * Se maneja como texto: `valueAsNumber` convierte un campo vacío en `NaN` y
     * el ajuste es opcional. Se convierte a número al enviar.
     */
    ajustes: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || Number.isFinite(Number(v)),
        'El ajuste debe ser un número (usa el signo menos para un descuento)',
      ),
    notas: z.string().trim().max(500, 'Máximo 500 caracteres'),
  })
  .refine((v) => !v.periodoInicio || !v.periodoFin || v.periodoFin >= v.periodoInicio, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['periodoFin'],
  });

type GenerarForm = z.infer<typeof generarSchema>;

function GenerarLiquidacionDrawer({
  colaboradores,
  prellenado,
  onClose,
  onCreada,
}: {
  colaboradores: OpcionColaborador[];
  /** Viene del panel «Por liquidar»: colaborador y periodo ya elegidos. */
  prellenado?: { colaboradorId: number; inicio: string; fin: string };
  onClose: () => void;
  onCreada: (id: number) => void;
}) {
  const qc = useQueryClient();
  const [errorApi, setErrorApi] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<GenerarForm>({
    resolver: zodResolver(generarSchema),
    defaultValues: {
      colaboradorId: prellenado ? String(prellenado.colaboradorId) : '',
      periodoInicio: prellenado?.inicio ?? '',
      periodoFin: prellenado?.fin ?? '',
      ajustes: '',
      notas: '',
    },
  });

  // `useWatch` en lugar de `watch()`: mantiene el valor en vivo sin romper la
  // memoización del compilador de React (`react/incompatible-library`).
  const periodoInicio = useWatch({ control, name: 'periodoInicio' });
  const periodoFin = useWatch({ control, name: 'periodoFin' });

  const generar = useMutation({
    mutationFn: (values: GenerarForm) =>
      LiquidacionesService.crear({
        colaboradorId: Number(values.colaboradorId),
        periodoInicio: values.periodoInicio,
        periodoFin: values.periodoFin,
        ajustes: values.ajustes === '' ? undefined : Number(values.ajustes),
        notas: values.notas.trim() || undefined,
      }),
    onSuccess: (data) => {
      toast.success('Liquidación generada. Revísala antes de aprobarla.');
      qc.invalidateQueries({ queryKey: [KEY_LIQUIDACIONES] });
      qc.invalidateQueries({ queryKey: [KEY_PENDIENTES] });
      onCreada(data.liquidacion_id);
      onClose();
    },
    onError: (err) => setErrorApi(err),
  });

  const onSubmit = handleSubmit((values) => {
    setErrorApi(null);
    generar.mutate(values);
  });

  const prellenarSemanaPasada = () => {
    const { inicio, fin: domingo } = rangoSemanaPasada();
    setValue('periodoInicio', inicio, { shouldValidate: true });
    setValue('periodoFin', domingo, { shouldValidate: true });
  };

  return (
    <Drawer
      titulo="Generar liquidación"
      subtitulo="Recalcula las comisiones devengadas del periodo y crea la liquidación."
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={generar.isPending || Boolean(errors.periodoFin)}
          >
            {generar.isPending ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <HandCoins size={16} aria-hidden="true" />
            )}
            Generar liquidación
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {errorApi ? <AvisoApi error={errorApi} onDescartar={() => setErrorApi(null)} /> : null}

        <div className="panel p-3 text-body-sm text-text-secondary">
          <p className="flex items-center gap-2 font-semibold text-text-primary">
            <CalendarRange size={14} className="text-accent-from" aria-hidden="true" />
            El corte se genera al cerrar la semana
          </p>
          <p className="mt-1">
            Lo habitual es generarla el lunes, con el rango de la semana que acaba de terminar. El
            periodo es inclusivo: se liquidan las ventas cobradas entre la fecha de inicio y la de
            fin, ambas incluidas.
          </p>
          <button
            type="button"
            className="btn-secondary mt-3 text-xs"
            onClick={prellenarSemanaPasada}
          >
            <CalendarRange size={14} aria-hidden="true" />
            Semana pasada
          </button>
        </div>

        <div>
          <label htmlFor="gen-colaborador" className="label">
            Colaborador *
          </label>
          <select
            id="gen-colaborador"
            className="select"
            aria-invalid={!!errors.colaboradorId}
            {...register('colaboradorId')}
          >
            <option value="">Selecciona un colaborador…</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.nombre}
              </option>
            ))}
          </select>
          {colaboradores.length === 0 && (
            <p className="field-help">
              No hay colaboradores activos. Da de alta uno antes de liquidar.
            </p>
          )}
          {errors.colaboradorId && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.colaboradorId.message}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="gen-inicio" className="label">
              Inicio del periodo *
            </label>
            <input
              id="gen-inicio"
              type="date"
              className="input tabular"
              aria-invalid={!!errors.periodoInicio}
              {...register('periodoInicio')}
            />
            {errors.periodoInicio && (
              <p className="field-error">
                <CircleAlert size={14} aria-hidden="true" /> {errors.periodoInicio.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="gen-fin" className="label">
              Fin del periodo *
            </label>
            <input
              id="gen-fin"
              type="date"
              className="input tabular"
              aria-invalid={!!errors.periodoFin}
              {...register('periodoFin')}
            />
            {errors.periodoFin && (
              <p className="field-error">
                <CircleAlert size={14} aria-hidden="true" /> {errors.periodoFin.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="gen-ajustes" className="label">
            Ajustes
          </label>
          <input
            id="gen-ajustes"
            type="number"
            inputMode="decimal"
            step="0.01"
            className="input tabular"
            placeholder="0.00"
            aria-invalid={!!errors.ajustes}
            {...register('ajustes')}
          />
          <p className="field-help">
            Positivo = a favor del colaborador (bono, comisión extra). Negativo = descuento o
            adelanto ya entregado. Se suma al total a pagar.
          </p>
          {errors.ajustes && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.ajustes.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="gen-notas" className="label">
            Notas
          </label>
          <textarea
            id="gen-notas"
            rows={3}
            className="textarea"
            placeholder="Motivo del ajuste, incidencias del periodo…"
            {...register('notas')}
          />
          {errors.notas && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.notas.message}
            </p>
          )}
        </div>

        {periodoInicio && periodoFin && (
          <p className="text-body-sm text-text-muted">
            Periodo seleccionado: {formatPeriodo(periodoInicio, periodoFin)}
          </p>
        )}
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// B) Drawer de detalle (aprobar · pagar · anular · imprimir)
// ─────────────────────────────────────────────────────────────────────────────

function DetalleLiquidacionDrawer({
  liquidacionId,
  colaboradores,
  onClose,
}: {
  liquidacionId: number;
  colaboradores: OpcionColaborador[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [errorApi, setErrorApi] = useState<unknown>(null);
  const [pagoVisible, setPagoVisible] = useState(false);
  const [anularVisible, setAnularVisible] = useState(false);

  const detalle = useQuery({
    queryKey: [KEY_LIQUIDACIONES, 'detalle', liquidacionId],
    queryFn: () => LiquidacionesService.obtener(liquidacionId),
  });

  const aprobar = useMutation({
    mutationFn: () => LiquidacionesService.aprobar(liquidacionId),
    onSuccess: () => {
      setErrorApi(null);
      toast.success('Liquidación aprobada. Ya se puede registrar el pago.');
      qc.invalidateQueries({ queryKey: [KEY_LIQUIDACIONES] });
      qc.invalidateQueries({ queryKey: [KEY_PENDIENTES] });
    },
    onError: (err) => setErrorApi(err),
  });

  const data: LiquidacionCompleta | undefined = detalle.data;
  const estado = data?.estado ?? '';
  const saldo = data ? saldoDe(data) : 0;
  const esPreliminar = estado === 'PENDIENTE';
  const esPagable = estado === 'APROBADA';
  const esPagada = estado === 'PAGADA';
  const esAnulada = estado === 'ANULADA';
  const estadoDesconocido = !esPreliminar && !esPagable && !esPagada && !esAnulada && estado !== '';

  const sumaDetalles = (data?.detalles ?? []).reduce((acc, d) => acc + Number(d.valor_comision), 0);

  const acciones = (() => {
    if (esPreliminar) {
      return (
        <>
          <button
            type="button"
            className="btn-primary"
            onClick={() => aprobar.mutate()}
            disabled={aprobar.isPending}
          >
            {aprobar.isPending ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <ThumbsUp size={16} aria-hidden="true" />
            )}
            Aprobar
          </button>
          <button type="button" className="btn-danger" onClick={() => setAnularVisible(true)}>
            <Ban size={16} aria-hidden="true" />
            Anular
          </button>
        </>
      );
    }
    if (esPagable) {
      return (
        <>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setPagoVisible(true)}
            disabled={saldo <= 0}
          >
            <HandCoins size={16} aria-hidden="true" />
            Registrar pago
          </button>
          <button type="button" className="btn-danger" onClick={() => setAnularVisible(true)}>
            <Ban size={16} aria-hidden="true" />
            Anular
          </button>
        </>
      );
    }
    if (esPagada) {
      return (
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" />
          Imprimir comprobante
        </button>
      );
    }
    return null;
  })();

  return (
    <>
      <Drawer
        titulo="Detalle de liquidación"
        subtitulo={
          data
            ? `${nombreDeColaborador(colaboradores, data.colaborador_id)} · ${formatPeriodo(
                data.periodo_inicio,
                data.periodo_fin,
              )}`
            : `Liquidación #${liquidacionId}`
        }
        onClose={onClose}
        cerrarConEsc={!pagoVisible && !anularVisible}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cerrar
            </button>
            {acciones}
          </>
        }
      >
        {errorApi ? <AvisoApi error={errorApi} onDescartar={() => setErrorApi(null)} /> : null}

        {detalle.isLoading && (
          <div className="space-y-3">
            <div className="skeleton h-6 w-2/3" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-40 w-full" />
          </div>
        )}

        {detalle.isError && (
          <div className={claseBanner('danger')} role="alert">
            <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {(detalle.error as { message?: string } | null)?.message ??
                `No se pudo cargar el detalle de la liquidación #${liquidacionId}.`}
            </span>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <BadgeEstado estado={data.estado} />
              <span className="text-body-sm text-text-muted">
                {formatNumero(data.detalles.length)}{' '}
                {data.detalles.length === 1 ? 'venta liquidada' : 'ventas liquidadas'}
              </span>
            </div>

            {esAnulada && (
              <div className={claseBanner('neutral')} role="status">
                <Ban size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Esta liquidación está anulada: sus líneas quedaron libres y esas ventas pueden
                  volver a liquidarse en un periodo posterior. El detalle se conserva como
                  historial.
                </span>
              </div>
            )}

            {estadoDesconocido && (
              <div className={claseBanner('warning')} role="status">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  El estado «{data.estado}» no tiene acciones disponibles en esta pantalla. Revísalo
                  en la base antes de operar con esta liquidación.
                </span>
              </div>
            )}

            {/* Totales */}
            <section className="panel p-4">
              {Number(data.sueldo_base ?? 0) > 0 && (
                <FilaTotal
                  etiqueta="Sueldo de período de prueba"
                  valor={formatMoney(Number(data.sueldo_base))}
                  ayuda={`${formatNumero(data.dias_sueldo ?? 0)} días · mensual ÷ 4 semanas`}
                />
              )}
              <FilaTotal
                etiqueta="Comisiones del periodo"
                valor={formatMoney(data.total_comisiones)}
              />
              {Number(data.ajustes) !== 0 && (
                <FilaTotal
                  etiqueta="Ajustes"
                  valor={formatMoney(data.ajustes, { signo: true })}
                  ayuda={Number(data.ajustes) > 0 ? 'a favor' : 'descuento o adelanto'}
                />
              )}
              <hr className="divider my-2" />
              <FilaTotal etiqueta="Total a pagar" valor={formatMoney(data.total_pagar)} destacado />
              <FilaTotal etiqueta="Pagado" valor={formatMoney(data.monto_pagado)} />

              <div className="mt-3 flex items-end justify-between gap-4 border-t border-border-subtle pt-3">
                <div>
                  <span className="text-body-sm text-text-muted">Saldo pendiente</span>
                  <p className="text-body-sm text-text-muted">
                    Total a pagar − pagado (calculado aquí: el backend no lo envía)
                  </p>
                </div>
                <span className="tabular text-h2 text-accent-from">{formatMoney(saldo)}</span>
              </div>
            </section>

            {data.notas && (
              <div className="panel p-3 text-body-sm text-text-secondary">
                <span className="font-semibold text-text-primary">Notas: </span>
                {data.notas}
              </div>
            )}

            {/* Detalle de comisiones: es lo que firma el colaborador */}
            <section>
              <h3 className="mb-2 text-h2 text-text-primary">Detalle de comisiones</h3>
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Venta</th>
                        <th scope="col" className="num">
                          Base de comisión
                        </th>
                        <th scope="col" className="num">
                          Porcentaje
                        </th>
                        <th scope="col" className="num">
                          Comisión
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.detalles ?? []).map((d: LiquidacionDetalle) => (
                        <tr key={d.id}>
                          <td className="strong">#{d.venta_id}</td>
                          <td className="num">{formatMoney(d.base_comision)}</td>
                          <td className="num">{formatPorcentaje(d.porcentaje_comision)}</td>
                          <td className="num strong">{formatMoney(d.valor_comision)}</td>
                        </tr>
                      ))}

                      {(data.detalles ?? []).length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center">
                            <p className="text-body text-text-secondary">
                              Esta liquidación no tiene líneas de comisión.
                            </p>
                            <p className="mt-1 text-body-sm text-text-muted">
                              No había comisiones devengadas en el periodo. Comprueba que las ventas
                              del rango estén cobradas y asignadas a este colaborador.
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {(data.detalles ?? []).length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={3} className="strong num">
                            Suma de las líneas
                          </td>
                          <td className="num strong">{formatMoney(sumaDetalles)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
              {(data.detalles ?? []).length > 0 &&
                Math.abs(sumaDetalles - Number(data.total_comisiones)) > 0.01 && (
                  <p className="field-help">
                    La suma de las líneas ({formatMoney(sumaDetalles)}) no coincide con las
                    comisiones del periodo ({formatMoney(data.total_comisiones)}). Avísalo antes de
                    pagar.
                  </p>
                )}
            </section>

            {/* Pagos */}
            <section>
              <h3 className="mb-2 text-h2 text-text-primary">Pagos</h3>
              {(data.pagos ?? []).length === 0 ? (
                <p className="text-body-sm text-text-muted">
                  Todavía no se ha registrado ningún pago para esta liquidación.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(data.pagos ?? []).map((p: PagoColaborador) => (
                    <li
                      key={p.id}
                      className="panel flex flex-wrap items-center justify-between gap-2 p-3 text-body-sm"
                    >
                      <span className="text-text-secondary">{formatFechaHora(p.fecha_hora)}</span>
                      <BadgeFormaPago forma={p.forma_pago} />
                      <span className="tabular font-semibold text-text-primary">
                        {formatMoney(p.monto)}
                      </span>
                      <span className="text-text-muted">
                        {p.referencia ? `Ref. ${p.referencia}` : 'Sin referencia'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {pagoVisible && data && (
        <RegistrarPagoDrawer
          liquidacionId={data.id}
          saldo={saldo}
          colaborador={nombreDeColaborador(colaboradores, data.colaborador_id)}
          periodo={formatPeriodo(data.periodo_inicio, data.periodo_fin)}
          onClose={() => setPagoVisible(false)}
        />
      )}

      {anularVisible && data && (
        <AnularLiquidacionDrawer
          liquidacionId={data.id}
          colaborador={nombreDeColaborador(colaboradores, data.colaborador_id)}
          periodo={formatPeriodo(data.periodo_inicio, data.periodo_fin)}
          onClose={() => setAnularVisible(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// C) Drawer "Registrar pago"
// ─────────────────────────────────────────────────────────────────────────────

const pagoSchema = z.object({
  monto: z.number({ error: 'Ingresa el monto' }).min(0.01, 'El monto debe ser mayor que cero'),
  /** El valor es la constante en MAYÚSCULAS que espera la BD. */
  formaPago: z.string().min(1, 'Selecciona la forma de pago'),
  cuentaFinancieraId: z.string().min(1, 'Selecciona la cuenta financiera'),
  referencia: z.string().trim().max(100, 'Máximo 100 caracteres'),
  notas: z.string().trim().max(500, 'Máximo 500 caracteres'),
});

type PagoForm = z.infer<typeof pagoSchema>;

function RegistrarPagoDrawer({
  liquidacionId,
  saldo,
  colaborador,
  periodo,
  onClose,
}: {
  liquidacionId: number;
  saldo: number;
  colaborador: string;
  periodo: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [errorApi, setErrorApi] = useState<unknown>(null);

  // ⚠️ La clave se genera UNA vez, al abrir el drawer: si se regenerara en cada
  // clic, un reintento de red duplicaría el pago.
  const [idempotencyKey] = useState(() => nuevaIdempotencyKey());

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PagoForm>({
    resolver: zodResolver(pagoSchema),
    defaultValues: {
      monto: saldo > 0 ? saldo : undefined,
      formaPago: '',
      cuentaFinancieraId: '',
      referencia: '',
      notas: '',
    },
  });

  const { data: cuentasFinancieras = [], isLoading: cargandoCuentas } = useQuery({
    queryKey: [KEY_FINANZAS, 'cuentas'],
    queryFn: () => FinanzasService.listar({ activo: true }),
  });

  const montoActual = Number(useWatch({ control, name: 'monto' }));
  const formaElegida = useWatch({ control, name: 'formaPago' });
  const cuentaElegida = useWatch({ control, name: 'cuentaFinancieraId' });
  // Efectivo sale de cuentas de efectivo; transferencia o tarjeta, de banco o billetera.
  const cuentasCompatibles = cuentasFinancieras.filter((cf) =>
    !formaElegida
      ? true
      : formaElegida === 'EFECTIVO'
        ? cf.tipo === 'EFECTIVO'
        : cf.tipo !== 'EFECTIVO',
  );
  const cuentaSel = cuentasFinancieras.find((cf) => String(cf.id) === cuentaElegida);
  const sinSaldo =
    cuentaSel !== undefined &&
    Number.isFinite(montoActual) &&
    montoActual > Number(cuentaSel.saldo_actual);
  const excede = Number.isFinite(montoActual) && montoActual > saldo;

  const registrar = useMutation({
    mutationFn: (values: PagoForm) =>
      LiquidacionesService.registrarPago(
        liquidacionId,
        {
          monto: values.monto,
          formaPago: values.formaPago,
          cuentaFinancieraId: Number(values.cuentaFinancieraId),
          referencia: values.referencia.trim() || undefined,
          notas: values.notas.trim() || undefined,
        },
        idempotencyKey,
      ),
    onSuccess: (_data, values) => {
      toast.success(`Pago de ${formatMoney(values.monto)} registrado.`);
      qc.invalidateQueries({ queryKey: [KEY_LIQUIDACIONES] });
      qc.invalidateQueries({ queryKey: [KEY_PENDIENTES] });
      onClose();
    },
    onError: (err) => setErrorApi(err),
  });

  const onSubmit = handleSubmit((values) => {
    setErrorApi(null);
    if (excede) return;
    registrar.mutate(values);
  });

  return (
    <Drawer
      titulo="Registrar pago"
      subtitulo={`${colaborador} · ${periodo}`}
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={registrar.isPending || excede || cargandoCuentas}
          >
            {registrar.isPending ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <HandCoins size={16} aria-hidden="true" />
            )}
            Registrar pago
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {errorApi ? <AvisoApi error={errorApi} onDescartar={() => setErrorApi(null)} /> : null}

        <div className="panel flex items-center justify-between p-3">
          <span className="text-body-sm text-text-muted">Saldo pendiente</span>
          <span className="tabular text-body font-bold text-text-primary">
            {formatMoney(saldo)}
          </span>
        </div>

        <div>
          <label htmlFor="pago-monto" className="label">
            Monto a pagar *
          </label>
          <input
            id="pago-monto"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            max={saldo}
            className="input tabular font-bold"
            aria-invalid={excede || !!errors.monto}
            autoFocus
            {...register('monto', { valueAsNumber: true })}
          />
          {excede ? (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> El monto supera el saldo pendiente
            </p>
          ) : errors.monto ? (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.monto.message}
            </p>
          ) : (
            <p className="field-help">
              Precargado con el saldo. Si pagas menos, la liquidación queda en pago parcial.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="pago-forma" className="label">
            Forma de pago *
          </label>
          <select
            id="pago-forma"
            className="select"
            aria-invalid={!!errors.formaPago}
            {...register('formaPago')}
          >
            <option value="">Selecciona una forma de pago…</option>
            {FORMAS_PAGO_OPCIONES.map((forma) => (
              <option key={forma} value={forma}>
                {metaEstado(FORMA_PAGO, forma).label}
              </option>
            ))}
          </select>
          <p className="field-help">
            Se guarda en MAYÚSCULAS ({FORMAS_PAGO_OPCIONES.join(' · ')}). Si es efectivo se exige
            una caja abierta.
          </p>
          {errors.formaPago && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.formaPago.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="pago-cuenta" className="label">
            Cuenta financiera que paga *
          </label>
          <select
            id="pago-cuenta"
            className="select"
            disabled={cargandoCuentas}
            aria-invalid={!!errors.cuentaFinancieraId}
            {...register('cuentaFinancieraId')}
          >
            <option value="">
              {cargandoCuentas ? 'Cargando cuentas…' : 'Selecciona una cuenta financiera…'}
            </option>
            {cuentasCompatibles.map((cf) => (
              <option key={cf.id} value={String(cf.id)}>
                {cf.nombre} · saldo {formatMoney(Number(cf.saldo_actual))}
              </option>
            ))}
          </select>
          {sinSaldo && cuentaSel && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {cuentaSel.nombre} tiene{' '}
              {formatMoney(Number(cuentaSel.saldo_actual))} según el sistema. Si en realidad hay
              más, ajústalo en «Bancos y efectivo», o paga una parte desde otra cuenta.
            </p>
          )}
          {!cargandoCuentas && cuentasFinancieras.length === 0 && (
            <p className="field-error">
              No hay cuentas financieras activas. Créalas en «Bancos y efectivo» antes de pagar.
            </p>
          )}
          {errors.cuentaFinancieraId && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.cuentaFinancieraId.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="pago-referencia" className="label">
            Referencia
          </label>
          <input
            id="pago-referencia"
            type="text"
            className="input"
            placeholder="Nº de transferencia, voucher…"
            {...register('referencia')}
          />
          {errors.referencia && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.referencia.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="pago-notas" className="label">
            Notas
          </label>
          <textarea id="pago-notas" rows={3} className="textarea" {...register('notas')} />
          {errors.notas && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.notas.message}
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// D) Confirmación de anulación
// ─────────────────────────────────────────────────────────────────────────────

const anularSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, 'Escribe el motivo de la anulación')
    .max(300, 'Máximo 300 caracteres'),
});

type AnularForm = z.infer<typeof anularSchema>;

function AnularLiquidacionDrawer({
  liquidacionId,
  colaborador,
  periodo,
  onClose,
}: {
  liquidacionId: number;
  colaborador: string;
  periodo: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [errorApi, setErrorApi] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AnularForm>({
    resolver: zodResolver(anularSchema),
    defaultValues: { motivo: '' },
  });

  const anular = useMutation({
    mutationFn: (values: AnularForm) =>
      LiquidacionesService.anular(liquidacionId, values.motivo.trim()),
    onSuccess: () => {
      toast.success('Liquidación anulada. Sus ventas pueden volver a liquidarse.');
      qc.invalidateQueries({ queryKey: [KEY_LIQUIDACIONES] });
      qc.invalidateQueries({ queryKey: [KEY_PENDIENTES] });
      onClose();
    },
    onError: (err) => setErrorApi(err),
  });

  const onSubmit = handleSubmit((values) => {
    setErrorApi(null);
    anular.mutate(values);
  });

  return (
    <Drawer
      titulo="Anular liquidación"
      subtitulo={`${colaborador} · ${periodo}`}
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Volver
          </button>
          <button
            type="submit"
            className="btn-danger"
            disabled={anular.isPending || !!errors.motivo}
          >
            {anular.isPending ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Ban size={16} aria-hidden="true" />
            )}
            Anular liquidación
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {errorApi ? <AvisoApi error={errorApi} onDescartar={() => setErrorApi(null)} /> : null}

        <div className={claseBanner('warning')} role="alert">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Esta acción libera las líneas de la liquidación.</p>
            <p className="mt-1">
              Las ventas incluidas podrán volver a liquidarse en un periodo posterior. El detalle
              actual se conserva como historial, pero la liquidación queda anulada y no se puede
              pagar. No se puede anular una liquidación ya pagada.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="anular-motivo" className="label">
            Motivo de la anulación *
          </label>
          <textarea
            id="anular-motivo"
            rows={3}
            className="textarea"
            placeholder="Ej.: el periodo incluía un servicio de otro colaborador"
            aria-invalid={!!errors.motivo}
            {...register('motivo')}
          />
          <p className="field-help">Queda registrado en la auditoría.</p>
          {errors.motivo && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.motivo.message}
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel «Por liquidar»: lo que se le debe a cada colaborador, listo para liquidar
// ─────────────────────────────────────────────────────────────────────────────

function PanelPorLiquidar({
  colaboradores,
  onLiquidar,
}: {
  colaboradores: OpcionColaborador[];
  onLiquidar: (p: ComisionPendiente) => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: [KEY_PENDIENTES],
    queryFn: () => LiquidacionesService.pendientes(),
  });

  if (isPending) {
    return (
      <div className="panel p-4 text-body-sm text-text-muted">
        Calculando comisiones por liquidar…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="banner banner-warning">
        <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>No se pudieron calcular las comisiones por liquidar.</span>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="panel p-4 text-body-sm text-text-muted">
        Ningún colaborador tiene comisiones pendientes de liquidar.
      </div>
    );
  }

  return (
    <section className="panel p-4" aria-labelledby="titulo-por-liquidar">
      <h2 id="titulo-por-liquidar" className="mb-3 text-sm font-semibold text-text-primary">
        Por liquidar
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((p) => (
          <li
            key={p.colaborador_id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-text-primary">
                {nombreDeColaborador(colaboradores, p.colaborador_id)}
              </p>
              <p className="text-xs text-text-muted">
                {formatNumero(p.cantidad_ventas)} {p.cantidad_ventas === 1 ? 'venta' : 'ventas'} ·{' '}
                {formatPeriodo(p.desde, p.hasta)}
              </p>
              {Number(p.sueldo_pendiente ?? 0) > 0 && (
                <p className="text-xs text-text-secondary">
                  En prueba: sueldo {formatMoney(Number(p.sueldo_pendiente))} (
                  {formatNumero(p.dias_sueldo ?? 0)} días)
                  {p.comision_pendiente > 0
                    ? ` + comisiones ${formatMoney(p.comision_pendiente)}`
                    : ''}
                </p>
              )}
              <p className="tabular mt-1 text-base font-semibold text-text-primary">
                {formatMoney(p.comision_pendiente + Number(p.sueldo_pendiente ?? 0))}
              </p>
            </div>
            <button
              type="button"
              className="btn-primary shrink-0 text-sm"
              onClick={() => onLiquidar(p)}
            >
              Liquidar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────

export const LiquidacionesPage: React.FC = () => {
  const [estado, setEstado] = useState('');
  const [colaboradorId, setColaboradorId] = useState('');
  const [periodoDesde, setPeriodoDesde] = useState('');
  const [periodoHasta, setPeriodoHasta] = useState('');
  const [page, setPage] = useState(1);

  const [generarVisible, setGenerarVisible] = useState(false);
  const [prellenado, setPrellenado] = useState<
    { colaboradorId: number; inicio: string; fin: string } | undefined
  >(undefined);
  const [detalleId, setDetalleId] = useState<number | null>(null);

  const { data: colaboradoresRes } = useQuery({
    queryKey: [KEY_COLABORADORES, 'opciones-liquidaciones'],
    queryFn: () => ColaboradoresService.listar({ activo: true, limit: 100 }),
    staleTime: 5 * 60_000,
  });
  const colaboradores: OpcionColaborador[] = colaboradoresRes?.data ?? [];

  const lista = useQuery({
    queryKey: [
      KEY_LIQUIDACIONES,
      'lista',
      {
        estado: estado || null,
        colaboradorId: colaboradorId || null,
        periodoDesde: periodoDesde || null,
        periodoHasta: periodoHasta || null,
        page,
      },
    ],
    queryFn: () =>
      LiquidacionesService.listar({
        estado: estado || undefined,
        colaboradorId: colaboradorId ? Number(colaboradorId) : undefined,
        periodoDesde: periodoDesde || undefined,
        periodoHasta: periodoHasta || undefined,
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const filas = lista.data?.data ?? [];
  const meta: Meta | undefined = lista.data?.meta;
  /** Suma de la página visible: el total global no viene en el listado. */
  const totalPagina = filas.reduce((acc, f) => acc + Number(f.total_pagar), 0);

  const hayFiltros =
    Boolean(estado) || Boolean(colaboradorId) || Boolean(periodoDesde) || Boolean(periodoHasta);

  const limpiarFiltros = () => {
    setEstado('');
    setColaboradorId('');
    setPeriodoDesde('');
    setPeriodoHasta('');
    setPage(1);
  };

  const filtrarSemanaPasada = () => {
    const { inicio, fin } = rangoSemanaPasada();
    setPeriodoDesde(inicio);
    setPeriodoHasta(fin);
    setPage(1);
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        titulo="Liquidaciones"
        descripcion="Comisiones devengadas por periodo. Genera la liquidación, revísala, apruébala y regístrala con su forma de pago y su cuenta financiera."
        icono={HandCoins}
        acciones={
          <button
            type="button"
            className="btn-primary flex items-center gap-2 text-sm"
            onClick={() => {
              setPrellenado(undefined);
              setGenerarVisible(true);
            }}
          >
            <RefreshCw size={16} aria-hidden="true" /> Generar liquidación
          </button>
        }
      />

      <PanelPorLiquidar
        colaboradores={colaboradores}
        onLiquidar={(p) => {
          setPrellenado({
            colaboradorId: p.colaborador_id,
            inicio: p.desde,
            fin: p.hasta,
          });
          setGenerarVisible(true);
        }}
      />

      {/* Filtros */}
      <div className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="filtro-desde" className="label">
            Periodo desde
          </label>
          <input
            id="filtro-desde"
            type="date"
            className="input tabular"
            value={periodoDesde}
            onChange={(e) => {
              setPeriodoDesde(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div>
          <label htmlFor="filtro-hasta" className="label">
            Periodo hasta
          </label>
          <input
            id="filtro-hasta"
            type="date"
            className="input tabular"
            value={periodoHasta}
            onChange={(e) => {
              setPeriodoHasta(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div>
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
                {ESTADO_LIQUIDACION[clave].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filtro-colaborador" className="label">
            Colaborador
          </label>
          <select
            id="filtro-colaborador"
            className="select"
            value={colaboradorId}
            onChange={(e) => {
              setColaboradorId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los colaboradores</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button type="button" className="btn-secondary text-xs" onClick={filtrarSemanaPasada}>
            <CalendarRange size={14} aria-hidden="true" /> Semana pasada
          </button>
          {hayFiltros && (
            <button type="button" className="btn-ghost text-xs" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          )}
          {lista.isFetching && !lista.isLoading && (
            <span className="text-body-sm text-text-muted">Actualizando…</span>
          )}
        </div>
      </div>

      {lista.isError && (
        <div className={claseBanner('danger')} role="alert">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {/*
            Se muestra el `message` del SERVIDOR, no un texto fijo (Regla 5).
            Un «inténtalo de nuevo» genérico tira información que el backend ya
            dio: `CAJA_NO_ABIERTA`, `PERIODO_INVALIDO` o un fallo de permisos
            requieren acciones distintas, y el usuario no puede distinguirlas si
            todas se ven igual. El texto fijo queda sólo como último recurso.
          */}
          <span>
            {(lista.error as { message?: string } | null)?.message ??
              'No se pudieron cargar las liquidaciones. Inténtalo de nuevo.'}
          </span>
        </div>
      )}

      {/* Tabla */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Colaborador</th>
                <th scope="col">Periodo</th>
                <th scope="col" className="num">
                  Comisiones
                </th>
                <th scope="col" className="num">
                  Pagado
                </th>
                <th scope="col" className="num">
                  Saldo
                </th>
                <th scope="col">Estado</th>
                <th scope="col" className="num">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td colSpan={7} className="p-4">
                      <div className="skeleton h-4 w-full" />
                    </td>
                  </tr>
                ))}

              {!lista.isLoading &&
                filas.map((fila) => {
                  const saldo = saldoDe(fila);
                  return (
                    <tr key={fila.id}>
                      <td className="strong">
                        {nombreDeColaborador(colaboradores, fila.colaborador_id)}
                      </td>
                      <td className="text-text-secondary">
                        {formatPeriodo(fila.periodo_inicio, fila.periodo_fin)}
                      </td>
                      <td className="num">{formatMoney(fila.total_comisiones)}</td>
                      <td className="num">{formatMoney(fila.monto_pagado)}</td>
                      <td className="num strong">{formatMoney(saldo)}</td>
                      <td>
                        <BadgeEstado estado={fila.estado} />
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          onClick={() => setDetalleId(fila.id)}
                        >
                          <Receipt size={14} aria-hidden="true" /> Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}

              {!lista.isLoading && filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center">
                    <p className="text-body text-text-secondary">
                      {hayFiltros
                        ? 'No hay liquidaciones que cumplan estos filtros.'
                        : 'Todavía no hay ninguna liquidación.'}
                    </p>
                    <p className="mt-1 text-body-sm text-text-muted">
                      Las liquidaciones se generan por periodo, normalmente el lunes con la semana
                      que acaba de terminar. Usa «Generar liquidación» para crear la primera.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>

            {!lista.isLoading && filas.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} className="num strong">
                    Total a pagar (página)
                  </td>
                  <td className="num strong">{formatMoney(totalPagina)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Paginación real con `meta` */}
        <div className="flex items-center justify-between border-t border-border-subtle p-4 text-body-sm text-text-secondary">
          <span className="tabular">
            Página {formatNumero(meta?.page ?? 1)} de{' '}
            {formatNumero(Math.max(1, meta?.totalPages ?? 1))} · {formatNumero(meta?.total ?? 0)}{' '}
            {meta?.total === 1 ? 'liquidación' : 'liquidaciones'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={!meta || page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {generarVisible && (
        <GenerarLiquidacionDrawer
          colaboradores={colaboradores}
          prellenado={prellenado}
          onClose={() => setGenerarVisible(false)}
          onCreada={(id) => setDetalleId(id)}
        />
      )}

      {detalleId !== null && (
        <DetalleLiquidacionDrawer
          liquidacionId={detalleId}
          colaboradores={colaboradores}
          onClose={() => setDetalleId(null)}
        />
      )}
    </div>
  );
};

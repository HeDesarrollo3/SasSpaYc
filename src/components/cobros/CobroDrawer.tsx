// src/components/cobros/CobroDrawer.tsx
//
// El **momento del cobro**: recepción o caja confirma que el cliente pagó un
// servicio que un colaborador registró.
//
// Llama a `POST /comandas/:id/confirmar` con `api.post` directo porque
// `confirmar` no está en `src/services/comandas.service.ts` (ese archivo está
// fuera del alcance de este cambio) y porque la operación exige el header
// `Idempotency-Key`, que `api.post` no añade solo. El patrón es el mismo de
// `LiquidacionesPage` → `RegistrarPagoDrawer`.
//
// ⚠️ **La clave de idempotencia se genera UNA vez, al abrir el drawer.** Si se
// regenerara en cada clic, un reintento del cajero tras un fallo de red crearía
// una segunda venta: es exactamente lo que la clave evita.
//
// Sobre el dinero: el total que se muestra es
// `subtotal − descuento + propina`, la misma fórmula de la RPC
// `confirmar_comanda` (`supabase/migrations/010_...sql`). El backend recalcula y
// devuelve el cambio definitivo; lo de aquí es la previsualización que el cajero
// necesita para dar el cambio en el mostrador.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClienteCobro, type ClienteElegido } from './ClienteCobro';
import { ClientesService } from '../../services/clientes.service';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import {
  Banknote,
  CircleAlert,
  Coins,
  CreditCard,
  HandCoins,
  Info,
  Landmark,
  LoaderCircle,
  Receipt,
  TriangleAlert,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { api, nuevaIdempotencyKey, type ApiSuccess } from '../../services/api';
import {
  codigoApi,
  comandasKeys,
  esErrorMigraciones,
  mensajeApi,
  nombreCliente,
  totalComanda,
} from '../../services/comandas.service';
import { FinanzasService } from '../../services/finanzas.service';
import { useFormato } from '../../hooks/useFormato';
import { useAuthStore } from '../../stores/auth.store';
import { formatMoney, formatNumero, formatPorcentaje } from '../../lib/format';
import { FORMA_PAGO, FORMAS_PAGO_OPCIONES, claseBanner, metaEstado } from '../../lib/estados';
import type { ComandaBandeja, ItemListado } from './ComandaPendienteCard';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

/** Clave compartida con el selector de cuenta de `LiquidacionesPage`. */
const KEY_FINANZAS = 'finanzas';

/** Billetes redondos del peso colombiano (no hay moneda fraccionaria en uso). */
const BILLETES_COP = [10_000, 20_000, 50_000, 100_000] as const;

/** Íconos por forma de pago (nunca un nombre por string). */
const ICONOS_FORMA_PAGO: Record<(typeof FORMAS_PAGO_OPCIONES)[number], LucideIcon> = {
  EFECTIVO: Banknote,
  TARJETA: CreditCard,
  // `lib/estados` referencia `Building2`, que no existe en esta versión de
  // `lucide-react`: su equivalente actual para una transferencia es `Landmark`.
  TRANSFERENCIA: Landmark,
};

/** Códigos que no son un fallo del cajero: se pintan como aviso ámbar. */
const CODIGOS_AVISO = [
  'COMANDA_YA_CONFIRMADA',
  'CAJA_NO_ABIERTA',
  'DESCUENTO_REQUIERE_ADMIN',
  'INVALID_STATE',
];

/** Respuesta de `POST /comandas/:id/confirmar` (RPC `confirmar_comanda`). */
type CobroConfirmado = {
  comanda_id: number;
  folio_comanda: string;
  venta_id: number;
  subtotal: number;
  descuento: number;
  propina: number;
  propina_destino: string | null;
  propina_colaborador: number;
  total: number;
  monto_recibido: number | null;
  cambio: number;
  comision_total: number;
  caja_id: number;
  cuenta_financiera_id: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades locales
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los importes se manejan como **texto** en el formulario: `valueAsNumber`
 * convierte un campo vacío en `NaN`, y aquí todos los campos numéricos son
 * opcionales salvo el recibido. Se convierten a número al enviar.
 */
const textoImporte = (mensaje: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || Number.isFinite(Number(v)), mensaje)
    .refine((v) => v === '' || Number(v) >= 0, 'No puede ser un importe negativo');

const cobroSchema = z.object({
  /** El valor es la constante en MAYÚSCULAS que espera la base. */
  formaPago: z.enum(FORMAS_PAGO_OPCIONES, { error: 'Elige la forma de pago' }),
  cuentaFinancieraId: z.string().min(1, 'Selecciona la cuenta financiera'),
  montoRecibido: textoImporte('El monto recibido debe ser un número'),
  propina: textoImporte('La propina debe ser un número'),
  descuento: textoImporte('El descuento debe ser un número'),
  referencia: z.string().trim().max(100, 'Máximo 100 caracteres'),
  notas: z.string().trim().max(500, 'Máximo 500 caracteres'),
});

type CobroForm = z.infer<typeof cobroSchema>;

/** Texto de un campo numérico → número ≥ 0. Vacío o basura cuentan como 0. */
function aNumero(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Importes rápidos para el efectivo: **el total exacto** y billetes redondos por
 * encima. Cuando el total ya supera los 100.000 no queda ningún billete por
 * encima que sirva, así que se añaden el siguiente múltiplo de 10.000 y de
 * 50.000: es lo que el cliente suele sacar del bolsillo.
 */
function importesRapidos(total: number): number[] {
  const exacto = Math.round(total);
  const candidatos = new Set<number>();
  if (exacto > 0) candidatos.add(exacto);

  for (const billete of BILLETES_COP) {
    if (billete > total) candidatos.add(billete);
  }

  if (total >= BILLETES_COP[BILLETES_COP.length - 1]) {
    candidatos.add(Math.ceil(total / 10_000) * 10_000 + 10_000);
    candidatos.add(Math.ceil(total / 50_000) * 50_000 + 50_000);
  }

  return [...candidatos].filter((v) => v > 0 && v >= total).sort((a, b) => a - b);
}

/**
 * Umbral de descuento sin aprobación (`descuento.umbralSinAprobacion`), en **%**.
 *
 * `FormatoApi` (`src/services/parametros.service.ts`) todavía no declara el
 * bloque `descuento` aunque el backend sí lo envía, y ese archivo está fuera del
 * alcance de este cambio: se lee de forma defensiva. Si no se puede leer, la
 * pantalla **no inventa un umbral**: deja el aviso al servidor, que es quien
 * manda (`DESCUENTO_REQUIERE_ADMIN`).
 */
function leerUmbralDescuento(formato: unknown): number | null {
  if (!formato || typeof formato !== 'object') return null;
  const bloque = (formato as { descuento?: { umbralSinAprobacion?: unknown } }).descuento;
  const valor = bloque?.umbralSinAprobacion;
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** Nombre del servicio en el resumen (mismo criterio que la tarjeta). */
function nombreServicio(item: ItemListado): string {
  return item.servicio_nombre?.trim() || `Servicio #${item.servicio_id}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aviso de error por código
// ─────────────────────────────────────────────────────────────────────────────

function AvisoCobro({ error, onDescartar }: { error: unknown; onDescartar: () => void }) {
  if (!error) return null;

  const codigo = codigoApi(error);
  const mensaje = mensajeApi(error);

  if (esErrorMigraciones(error)) {
    return (
      <div className={claseBanner('info')} role="status">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold">El cobro aún no está disponible</p>
          <p className="mt-1">
            No es un fallo de la pantalla: falta activarlo. Avisa a administración antes de intentar
            cobrar.
          </p>
          <p className="mt-1 text-body-sm opacity-80">{mensaje}</p>
        </div>
        <button
          type="button"
          className="btn-icon"
          onClick={onDescartar}
          aria-label="Descartar aviso"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  const esAviso = CODIGOS_AVISO.includes(codigo);
  const Icono = esAviso ? TriangleAlert : CircleAlert;

  return (
    <div className={claseBanner(esAviso ? 'warning' : 'danger')} role="alert">
      <Icono size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        {codigo === 'COMANDA_YA_CONFIRMADA' && (
          <p className="font-semibold">
            Alguien cobró esta comanda mientras tenías el formulario abierto.
          </p>
        )}
        <p className={codigo === 'COMANDA_YA_CONFIRMADA' ? 'mt-0.5' : 'font-semibold'}>{mensaje}</p>
        {codigo === 'COMANDA_YA_CONFIRMADA' && (
          <p className="mt-1 text-xs opacity-80">
            Refresca la bandeja: la comanda ya está cobrada y no admite un segundo cobro. La lista
            se actualiza sola al cerrar.
          </p>
        )}
        {codigo === 'CAJA_NO_ABIERTA' && (
          <p className="mt-1 text-xs">
            <Link to="/caja" className="font-semibold underline">
              Abrir caja
            </Link>{' '}
            y vuelve a intentar el cobro.
          </p>
        )}
        {codigo === 'SELF_CONFIRMATION_FORBIDDEN' && (
          <p className="mt-1 text-xs opacity-80">
            El cobro lo tiene que registrar otra persona: recepción, caja o administración.
          </p>
        )}
        <p className="mt-0.5 text-[11px] opacity-80">Código: {codigo}</p>
      </div>
      <button type="button" className="btn-icon" onClick={onDescartar} aria-label="Descartar aviso">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawer (mismo patrón que `LiquidacionesPage`)
// ─────────────────────────────────────────────────────────────────────────────

function Drawer({
  titulo,
  subtitulo,
  onClose,
  onSubmit,
  footer,
  children,
  cerrarConEsc,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  footer: ReactNode;
  children: ReactNode;
  cerrarConEsc: boolean;
}) {
  useEffect(() => {
    if (!cerrarConEsc) return;
    const alTeclear = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose, cerrarConEsc]);

  return (
    <>
      {/* El fondo sólo cierra cuando el cobro no está en vuelo (igual que Esc). */}
      <div
        className="drawer-backdrop"
        role="presentation"
        onClick={cerrarConEsc ? onClose : undefined}
      />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="drawer-header">
          <div>
            <h2 className="text-base font-bold text-text-primary">{titulo}</h2>
            {subtitulo && <p className="mt-1 text-xs text-text-secondary">{subtitulo}</p>}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={16} aria-hidden="true" />
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
// Drawer de cobro
// ─────────────────────────────────────────────────────────────────────────────

export function CobroDrawer({
  comanda,
  nombresColaboradores,
  onClose,
}: {
  comanda: ComandaBandeja;
  nombresColaboradores: ReadonlyMap<number, string>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const rol = useAuthStore((s) => s.user?.rol);
  const { formato } = useFormato();

  const [errorApi, setErrorApi] = useState<unknown>(null);

  // ⚠️ UNA sola vez, al abrir el drawer (ver la nota de cabecera del archivo).
  const [idempotencyKey] = useState(() => nuevaIdempotencyKey());
  // Cliente referido (migración 023): lo marca el colaborador, recepción lo confirma o corrige.
  const [referido, setReferido] = useState<boolean>(comanda.cliente_referido ?? false);
  // Cliente que recepción guarda o vincula al cobrar (migración 025).
  const [clienteElegido, setClienteElegido] = useState<ClienteElegido>(null);

  const subtotal = totalComanda(comanda);
  const items = comanda.items ?? [];
  const colaborador =
    nombresColaboradores.get(comanda.colaborador_id) ?? `Colaborador #${comanda.colaborador_id}`;
  const propinaHabilitada = formato?.propina?.habilitada === true;
  const umbralDescuento = leerUmbralDescuento(formato);
  const esAdmin = rol === 'administrador';

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CobroForm>({
    resolver: zodResolver(cobroSchema),
    defaultValues: {
      formaPago: 'EFECTIVO',
      cuentaFinancieraId: '',
      montoRecibido: '',
      propina: '',
      descuento: '',
      referencia: '',
      notas: '',
    },
  });

  const formaPago = useWatch({ control, name: 'formaPago' });
  const cuentaFinancieraId = useWatch({ control, name: 'cuentaFinancieraId' });
  const montoRecibidoTexto = useWatch({ control, name: 'montoRecibido' });
  const propinaTexto = useWatch({ control, name: 'propina' });
  const descuentoTexto = useWatch({ control, name: 'descuento' });

  const propina = aNumero(propinaTexto);
  const descuento = aNumero(descuentoTexto);
  const totalCrudo = subtotal - descuento + propina;
  const totalNegativo = totalCrudo < 0;
  const total = Math.max(0, totalCrudo);

  const esEfectivo = formaPago === 'EFECTIVO';
  const recibido = aNumero(montoRecibidoTexto);
  const faltante = esEfectivo ? Math.max(0, total - recibido) : 0;
  const cambio = esEfectivo && faltante === 0 ? recibido - total : 0;

  /** Descuento que excede lo que este rol puede aplicar sin administración. */
  const porcentajeDescuento = subtotal > 0 ? (descuento / subtotal) * 100 : 100;
  const descuentoBloqueado =
    !esAdmin && descuento > 0 && umbralDescuento !== null && porcentajeDescuento > umbralDescuento;

  const cuentas = useQuery({
    queryKey: [KEY_FINANZAS, 'cuentas'],
    queryFn: () => FinanzasService.listar({ activo: true }),
  });
  const cuentasFinancieras = cuentas.data ?? [];

  const cobrar = useMutation({
    mutationFn: async (values: CobroForm) => {
      // 1. Si recepción completó los datos de un cliente nuevo, se crea primero.
      let clienteId: number | undefined;
      if (clienteElegido?.tipo === 'existente') clienteId = clienteElegido.id;
      if (clienteElegido?.tipo === 'nuevo') {
        const creado = await ClientesService.guardar({
          nombre: clienteElegido.nombre,
          telefono: clienteElegido.telefono,
          fecha_nacimiento: clienteElegido.fecha_nacimiento || null,
          autoriza_datos: clienteElegido.autoriza_datos,
        });
        clienteId = creado.cliente_id;
      }
      const payload: Record<string, unknown> = {
        forma_pago: values.formaPago,
        cuenta_financiera_id: Number(values.cuentaFinancieraId),
      };
      // Los campos opcionales sólo se envían si aportan algo: el DTO del backend
      // valida con `forbidNonWhitelisted` y no conviene mandar `undefined`.
      if (values.formaPago === 'EFECTIVO') payload.monto_recibido = aNumero(values.montoRecibido);
      const propinaValor = aNumero(values.propina);
      if (propinaValor > 0) payload.propina = propinaValor;
      const descuentoValor = aNumero(values.descuento);
      if (descuentoValor > 0) payload.descuento = descuentoValor;
      const referencia = values.referencia.trim();
      if (referencia) payload.referencia = referencia;
      const notas = values.notas.trim();
      if (notas) payload.notas = notas;
      if (referido !== (comanda.cliente_referido ?? false)) payload.cliente_referido = referido;
      if (clienteId) payload.cliente_id = clienteId;

      return api.post<unknown, ApiSuccess<CobroConfirmado>>(
        `/comandas/${comanda.id}/confirmar`,
        payload,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
    },
    onSuccess: (res) => {
      const r = res.data;
      toast.success(`Venta #${r.venta_id} · ${formatMoney(r.total)}`, {
        description:
          r.cambio > 0
            ? `Cambio a devolver: ${formatMoney(r.cambio)}`
            : `Comanda ${r.folio_comanda} cobrada y comisión liquidada.`,
      });
      // La raíz invalida la bandeja, el contador del sidebar y los detalles.
      qc.invalidateQueries({ queryKey: comandasKeys.todas });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      onClose();
    },
    onError: (err) => {
      setErrorApi(err);
      // Si ya estaba cobrada, la bandeja de detrás está desactualizada: se
      // refresca para que el cajero la vea desaparecer.
      if (codigoApi(err) === 'COMANDA_YA_CONFIRMADA') {
        qc.invalidateQueries({ queryKey: comandasKeys.todas });
      }
    },
  });

  const yaCobrada = Boolean(errorApi) && codigoApi(errorApi) === 'COMANDA_YA_CONFIRMADA';

  const onSubmit = handleSubmit((values) => {
    setErrorApi(null);
    if (faltante > 0 || totalNegativo || descuentoBloqueado) return;
    cobrar.mutate(values);
  });

  const sinCuentas = !cuentas.isPending && cuentasFinancieras.length === 0;
  const confirmarDeshabilitado =
    cobrar.isPending ||
    yaCobrada ||
    !cuentaFinancieraId ||
    faltante > 0 ||
    totalNegativo ||
    descuentoBloqueado ||
    sinCuentas;

  const rapidos = esEfectivo ? importesRapidos(total) : [];

  return (
    <Drawer
      titulo="Cobrar servicio"
      subtitulo={
        <>
          <span className="tabular">{comanda.folio}</span> · {nombreCliente(comanda)} ·{' '}
          {colaborador}
        </>
      }
      onClose={onClose}
      onSubmit={onSubmit}
      // Mientras el cobro viaja no se cierra con Esc: el cajero no debe perder de
      // vista si la operación terminó.
      cerrarConEsc={!cobrar.isPending}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={confirmarDeshabilitado}>
            {cobrar.isPending ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <HandCoins size={16} aria-hidden="true" />
            )}
            Cobrar {formatMoney(total)}
          </button>
        </>
      }
    >
      {/* `space-y-6`: era el último `space-y-5` del repo. La guía deja sólo dos
          ritmos — sección (`6`) y elementos dentro de un bloque (`4`) — y un
          tercer valor intermedio es justo lo que hacía que las pantallas no
          parecieran la misma app. */}
      <div className="space-y-6">
        <AvisoCobro error={errorApi} onDescartar={() => setErrorApi(null)} />

        {/* ── Resumen: qué se está cobrando y cuánto ── */}
        <section className="panel p-4" aria-label="Resumen del servicio">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="tabular text-xs text-text-muted">{comanda.folio}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <Receipt size={14} className="shrink-0 text-accent-from" aria-hidden="true" />
                <span className="truncate">{nombreCliente(comanda)}</span>
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">{colaborador}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-label text-text-secondary">Total a cobrar</span>
              <p className="tabular text-3xl font-bold text-text-primary">{formatMoney(total)}</p>
            </div>
          </div>

          <ul className="mt-3 space-y-1 border-t border-border-subtle pt-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-text-secondary">
                  {nombreServicio(item)}
                  <span className="ml-1 text-text-muted">×{formatNumero(item.cantidad)}</span>
                  {item.combo_nombre && (
                    <span className="ml-1 text-accent-from">· {item.combo_nombre}</span>
                  )}
                </span>
                <span className="tabular shrink-0 text-text-secondary">
                  {formatMoney(
                    Number(item.precio_unitario_estimado ?? 0) * Number(item.cantidad ?? 0),
                  )}
                </span>
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-xs text-text-muted">
                Sin líneas en el listado. El importe de arriba es el total estimado de la comanda.
              </li>
            )}
          </ul>

          {(descuento > 0 || propina > 0) && (
            <div className="mt-2 space-y-0.5 border-t border-border-subtle pt-2 text-xs">
              <p className="flex items-center justify-between text-text-muted">
                <span>Subtotal</span>
                <span className="tabular">{formatMoney(subtotal)}</span>
              </p>
              {descuento > 0 && (
                <p className="flex items-center justify-between text-text-muted">
                  <span>Descuento</span>
                  <span className="tabular">−{formatMoney(descuento)}</span>
                </p>
              )}
              {propina > 0 && (
                <p className="flex items-center justify-between text-text-muted">
                  <span>Propina</span>
                  <span className="tabular">+{formatMoney(propina)}</span>
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Cliente: guardar o vincular (migración 025) ── */}
        <ClienteCobro
          clienteIdActual={comanda.cliente_id}
          nombreEscrito={comanda.cliente_nombre ?? ''}
          onCambio={setClienteElegido}
        />

        {/* ── Cliente referido (migración 023) ── */}
        <label className="panel flex items-start gap-3 p-4">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--color-accent-from)]"
            checked={referido}
            onChange={(e) => setReferido(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-text-primary">
              Cliente referido por {colaborador}
            </span>
            <span className="block text-xs text-text-secondary">
              {comanda.cliente_referido
                ? 'El colaborador lo marcó como cliente suyo. Desmárcalo si es cliente del spa.'
                : 'Márcalo si el cliente lo trajo el colaborador.'}{' '}
              Solo cambia la comisión del personal de cabello con porcentaje de referido.
            </span>
          </span>
        </label>

        {/* ── Forma de pago: botones grandes, no un select ── */}
        <fieldset>
          <legend className="label">Forma de pago *</legend>
          <div className="grid grid-cols-3 gap-2">
            {FORMAS_PAGO_OPCIONES.map((opcion) => {
              const activa = formaPago === opcion;
              const Icono = ICONOS_FORMA_PAGO[opcion];
              return (
                <button
                  key={opcion}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => setValue('formaPago', opcion, { shouldValidate: true })}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-sm border px-2 py-2 text-xs font-semibold transition-colors ${
                    activa
                      ? 'border-accent-from/50 bg-accent-from/15 text-accent-from'
                      : 'border-border-subtle bg-surface-card text-text-muted hover:text-text-primary'
                  }`}
                >
                  <Icono size={18} aria-hidden="true" />
                  {metaEstado(FORMA_PAGO, opcion).label}
                </button>
              );
            })}
          </div>
          <p className="field-help">
            Se guarda en MAYÚSCULAS ({FORMAS_PAGO_OPCIONES.join(' · ')}).
          </p>
        </fieldset>

        {/* ── Cuenta financiera: obligatoria ── */}
        <div>
          <label htmlFor="cobro-cuenta" className="label">
            Cuenta financiera *
          </label>
          <select
            id="cobro-cuenta"
            className="select"
            disabled={cuentas.isPending}
            aria-invalid={!!errors.cuentaFinancieraId}
            {...register('cuentaFinancieraId')}
          >
            <option value="">
              {cuentas.isPending ? 'Cargando cuentas…' : 'Selecciona dónde entra el dinero…'}
            </option>
            {cuentasFinancieras.map((cf) => (
              <option key={cf.id} value={String(cf.id)}>
                {cf.nombre} · {cf.tipo}
              </option>
            ))}
          </select>
          {cuentas.isError ? (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> No se pudieron cargar las cuentas
              financieras. Sin cuenta no se puede cobrar.
            </p>
          ) : sinCuentas ? (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> No hay cuentas financieras activas.
              Créalas en «Cuentas financieras» antes de cobrar.
            </p>
          ) : errors.cuentaFinancieraId ? (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.cuentaFinancieraId.message}
            </p>
          ) : (
            <p className="field-help">Es el destino del dinero en caja o banco.</p>
          )}
        </div>

        {/* ── Efectivo: recibido, importes rápidos y cambio en vivo ── */}
        {esEfectivo && (
          <section className="space-y-3" aria-label="Efectivo recibido">
            <div>
              <label htmlFor="cobro-recibido" className="label">
                Recibido *
              </label>
              <input
                id="cobro-recibido"
                type="number"
                inputMode="numeric"
                min={0}
                // `step="any"`: en pesos colombianos un importe como $45.550 es
                // legítimo, y un `step` fijo haría que el navegador bloqueara el
                // envío por `stepMismatch` sin dejar ver ningún mensaje propio.
                step="any"
                className="input tabular text-lg font-bold"
                placeholder={String(Math.round(total))}
                autoFocus
                aria-invalid={faltante > 0 || !!errors.montoRecibido}
                {...register('montoRecibido')}
              />
              {faltante > 0 ? (
                <p className="field-error">
                  <CircleAlert size={14} aria-hidden="true" /> Faltan {formatMoney(faltante)} para
                  cubrir el total.
                </p>
              ) : errors.montoRecibido ? (
                <p className="field-error">
                  <CircleAlert size={14} aria-hidden="true" /> {errors.montoRecibido.message}
                </p>
              ) : (
                <p className="field-help">
                  Escribe lo que te ha dado el cliente o usa un importe rápido.
                </p>
              )}
            </div>

            {rapidos.length > 0 && (
              <div>
                <span className="label">Importes rápidos</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {rapidos.map((importe) => {
                    const esExacto = importe === Math.round(total);
                    return (
                      <button
                        key={importe}
                        type="button"
                        className="btn-secondary tabular text-xs"
                        aria-label={`Recibido ${formatMoney(importe)}${esExacto ? ' (importe exacto)' : ''}`}
                        onClick={() =>
                          setValue('montoRecibido', String(importe), {
                            shouldValidate: true,
                            shouldDirty: true,
                          })
                        }
                      >
                        <Coins size={14} aria-hidden="true" />
                        {formatMoney(importe)}
                        {esExacto && <span className="text-[10px] text-text-muted">exacto</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-sm border border-success/30 bg-success/10 p-3 text-center">
              <span className="text-label text-text-secondary">Cambio</span>
              <p className="tabular text-2xl font-bold text-success">{formatMoney(cambio)}</p>
            </div>
          </section>
        )}

        {/* ── Propina (sólo si el negocio la tiene habilitada) ── */}
        {propinaHabilitada && (
          <div>
            <label htmlFor="cobro-propina" className="label">
              Propina
            </label>
            <input
              id="cobro-propina"
              type="number"
              inputMode="numeric"
              min={0}
              step="any"
              className="input tabular"
              placeholder="0"
              aria-invalid={!!errors.propina}
              {...register('propina')}
            />
            <p className="field-help">
              Se suma al total. El reparto entre negocio y colaborador lo decide la política
              configurada y se congela al cobrar.
            </p>
            {errors.propina && (
              <p className="field-error">
                <CircleAlert size={14} aria-hidden="true" /> {errors.propina.message}
              </p>
            )}
          </div>
        )}

        {/* ── Descuento: se avisa ANTES de intentarlo ── */}
        <div>
          <label htmlFor="cobro-descuento" className="label">
            Descuento
          </label>
          <input
            id="cobro-descuento"
            type="number"
            inputMode="numeric"
            min={0}
            step="any"
            className="input tabular"
            placeholder="0"
            aria-invalid={descuentoBloqueado || totalNegativo || !!errors.descuento}
            {...register('descuento')}
          />
          {descuentoBloqueado && umbralDescuento !== null ? (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> Un descuento de {formatMoney(descuento)}{' '}
              ({formatPorcentaje(porcentajeDescuento)} del subtotal) supera el{' '}
              {formatPorcentaje(umbralDescuento)} que puede aplicar sin autorización. Pide a
              administración que lo aplique.
            </p>
          ) : totalNegativo ? (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> El descuento no puede dejar el total en
              negativo.
            </p>
          ) : errors.descuento ? (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.descuento.message}
            </p>
          ) : descuento > 0 && umbralDescuento === null && !esAdmin ? (
            <p className="field-help">
              No se pudo leer el umbral de descuento configurado. Si supera el máximo permitido, el
              servidor rechazará el cobro y te lo dirá.
            </p>
          ) : (
            <p className="field-help">
              En importe, no en porcentaje. Sólo administración puede pasar del umbral configurado.
            </p>
          )}
        </div>

        {/* ── Referencia y notas ── */}
        <div>
          <label htmlFor="cobro-referencia" className="label">
            Referencia
          </label>
          <input
            id="cobro-referencia"
            type="text"
            className="input"
            placeholder={
              esEfectivo
                ? 'Opcional (nº de recibo, observación)'
                : 'Nº de transferencia, voucher, aprobación…'
            }
            {...register('referencia')}
          />
          {errors.referencia && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.referencia.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="cobro-notas" className="label">
            Notas
          </label>
          <textarea
            id="cobro-notas"
            rows={2}
            className="textarea"
            placeholder="Ajustes de última hora, quién autorizó el descuento…"
            {...register('notas')}
          />
          {errors.notas && (
            <p className="field-error">
              <CircleAlert size={14} aria-hidden="true" /> {errors.notas.message}
            </p>
          )}
        </div>

        <p className="field-help flex items-start gap-1.5">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Al confirmar se crea la venta, entra el dinero en la cuenta elegida, se descuenta el
            stock de los insumos y queda liquidada la comisión del colaborador. Una comanda ya
            cobrada no se puede cobrar dos veces.
          </span>
        </p>

        {esEfectivo && (
          <p className="field-help flex items-start gap-1.5">
            <Wallet size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              El efectivo exige una caja abierta para esa cuenta financiera; si no la hay, el
              servidor rechazará el cobro.
            </span>
          </p>
        )}
      </div>
    </Drawer>
  );
}

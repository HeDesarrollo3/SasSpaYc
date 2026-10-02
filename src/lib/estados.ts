/**
 * Estados del dominio: **una sola fuente de verdad** para etiquetas y badges.
 *
 * ⚠️ Los valores string coinciden EXACTAMENTE con lo que guarda la base de datos
 * (MAYÚSCULAS). Verificado contra Supabase — ver
 * [`docs/03-ESQUEMA-VERIFICADO.md` §2](../../docs/03-ESQUEMA-VERIFICADO.md).
 *
 * Nunca escribas un estado como literal en un componente: importa de aquí.
 * Si añades un valor, añádelo también en el `CHECK` de la base.
 */

export type Tono = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

export type EstadoMeta = {
  label: string;
  tono: Tono;
  /** Ícono de `lucide-react` (se resuelve en el componente para no acoplar este módulo). */
  icono?: string;
  /** Si el estado implica que todavía hay que hacer algo. */
  pendiente?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Comandas (registro de servicio del colaborador)
// ─────────────────────────────────────────────────────────────────────────────
export const ESTADO_COMANDA = {
  borrador: { label: 'Borrador', tono: 'neutral' },
  pendiente: { label: 'Por cobrar', tono: 'warning', icono: 'Clock', pendiente: true },
  confirmada: { label: 'Cobrado', tono: 'success', icono: 'CheckCircle2' },
  rechazada: { label: 'Rechazada', tono: 'danger', icono: 'XCircle' },
  anulada: { label: 'Anulada', tono: 'neutral', icono: 'Ban' },
} as const satisfies Record<string, EstadoMeta>;
export type EstadoComanda = keyof typeof ESTADO_COMANDA;

// ─────────────────────────────────────────────────────────────────────────────
// Ventas — valores reales en `ventas.estado`: PENDIENTE · PAGADA
// ─────────────────────────────────────────────────────────────────────────────
export const ESTADO_VENTA = {
  PENDIENTE: { label: 'Pendiente', tono: 'warning', icono: 'Clock', pendiente: true },
  PARCIAL: { label: 'Pago parcial', tono: 'warning', icono: 'CircleDollarSign', pendiente: true },
  PAGADA: { label: 'Pagada', tono: 'success', icono: 'CheckCircle2' },
  CREDITO: { label: 'En crédito', tono: 'info', icono: 'CreditCard', pendiente: true },
  ANULADA: { label: 'Anulada', tono: 'neutral', icono: 'Ban' },
} as const satisfies Record<string, EstadoMeta>;
export type EstadoVenta = keyof typeof ESTADO_VENTA;

// ─────────────────────────────────────────────────────────────────────────────
// Cajas — valores reales en `cajas.estado`: ABIERTA · CERRADA
// ─────────────────────────────────────────────────────────────────────────────
export const ESTADO_CAJA = {
  ABIERTA: { label: 'Abierta', tono: 'success', icono: 'Unlock' },
  CERRADA: { label: 'Cerrada', tono: 'neutral', icono: 'Lock' },
} as const satisfies Record<string, EstadoMeta>;
export type EstadoCaja = keyof typeof ESTADO_CAJA;

// ─────────────────────────────────────────────────────────────────────────────
// Movimientos de caja — `movimientos_caja.tipo_movimiento`: INGRESO · EGRESO
// ─────────────────────────────────────────────────────────────────────────────
export const TIPO_MOVIMIENTO = {
  INGRESO: { label: 'Ingreso', tono: 'success', icono: 'ArrowDownLeft' },
  EGRESO: { label: 'Egreso', tono: 'danger', icono: 'ArrowUpRight' },
} as const satisfies Record<string, EstadoMeta>;
export type TipoMovimientoCaja = keyof typeof TIPO_MOVIMIENTO;

// ─────────────────────────────────────────────────────────────────────────────
// Cuentas por cobrar / pagar — `PARCIAL` observado en la base
// ─────────────────────────────────────────────────────────────────────────────
export const ESTADO_CUENTA = {
  PENDIENTE: { label: 'Pendiente', tono: 'warning', icono: 'Clock', pendiente: true },
  PARCIAL: { label: 'Abono parcial', tono: 'warning', icono: 'CircleDollarSign', pendiente: true },
  PAGADA: { label: 'Pagada', tono: 'success', icono: 'CheckCircle2' },
  VENCIDA: { label: 'Vencida', tono: 'danger', icono: 'AlertTriangle', pendiente: true },
  ANULADA: { label: 'Anulada', tono: 'neutral', icono: 'Ban' },
} as const satisfies Record<string, EstadoMeta>;
export type EstadoCuenta = keyof typeof ESTADO_CUENTA;

// ─────────────────────────────────────────────────────────────────────────────
// Liquidaciones — estados del CHECK real: PENDIENTE · APROBADA (también con pago parcial) · PAGADA · ANULADA
// ─────────────────────────────────────────────────────────────────────────────
export const ESTADO_LIQUIDACION = {
  PENDIENTE: { label: 'Por aprobar', tono: 'warning', icono: 'FileText', pendiente: true },
  APROBADA: { label: 'Aprobada', tono: 'info', icono: 'ThumbsUp', pendiente: true },
  PAGADA: { label: 'Pagada', tono: 'success', icono: 'CheckCircle2' },
  ANULADA: { label: 'Anulada', tono: 'neutral', icono: 'Ban' },
} as const satisfies Record<string, EstadoMeta>;
export type EstadoLiquidacion = keyof typeof ESTADO_LIQUIDACION;

// ─────────────────────────────────────────────────────────────────────────────
// Formas de pago — `forma_pago`: EFECTIVO | TRANSFERENCIA (observados)
// ─────────────────────────────────────────────────────────────────────────────
export const FORMA_PAGO = {
  EFECTIVO: { label: 'Efectivo', tono: 'success', icono: 'Banknote' },
  TARJETA: { label: 'Tarjeta', tono: 'info', icono: 'CreditCard' },
  TRANSFERENCIA: { label: 'Transferencia', tono: 'accent', icono: 'Building2' },
} as const satisfies Record<string, EstadoMeta>;
export type FormaPago = keyof typeof FORMA_PAGO;

/** Formas de pago para selectores, en orden de uso típico en un spa. */
export const FORMAS_PAGO_OPCIONES = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de cuenta financiera — `cuentas_financieras.tipo` observados
// ─────────────────────────────────────────────────────────────────────────────
export const TIPO_CUENTA_FINANCIERA = {
  EFECTIVO: { label: 'Efectivo', tono: 'success', icono: 'Banknote' },
  BANCO: { label: 'Banco', tono: 'info', icono: 'Building2' },
  BILLETERA_DIGITAL: { label: 'Billetera digital', tono: 'accent', icono: 'Smartphone' },
  TARJETA: { label: 'Tarjeta', tono: 'info', icono: 'CreditCard' },
  OTRO: { label: 'Otro', tono: 'neutral', icono: 'Wallet' },
} as const satisfies Record<string, EstadoMeta>;
export type TipoCuentaFinanciera = keyof typeof TIPO_CUENTA_FINANCIERA;

// ─────────────────────────────────────────────────────────────────────────────
// Roles — valores reales en `usuarios.rol`
// ─────────────────────────────────────────────────────────────────────────────
export const ROL = {
  administrador: { label: 'Administración', tono: 'accent', icono: 'ShieldCheck' },
  recepcionista: { label: 'Recepción', tono: 'info', icono: 'ConciergeBell' },
  cajero: { label: 'Cajero', tono: 'success', icono: 'Wallet' },
  colaborador: { label: 'Colaborador', tono: 'warning', icono: 'Sparkles' },
} as const satisfies Record<string, EstadoMeta>;
export type Rol = keyof typeof ROL;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve la metadata de un estado, con un fallback legible si no se reconoce. */
export function metaEstado<T extends Record<string, EstadoMeta>>(
  mapa: T,
  valor: string | null | undefined,
): EstadoMeta {
  if (!valor) return { label: '—', tono: 'neutral' };
  return (mapa as Record<string, EstadoMeta>)[valor] ?? { label: valor, tono: 'neutral' };
}

/** Clases Tailwind del badge para un tono. */
export function claseBadge(tono: Tono): string {
  return `badge badge-${tono}`;
}

/** Clases Tailwind del banner para un tono. */
export function claseBanner(tono: Tono): string {
  return `banner banner-${tono}`;
}

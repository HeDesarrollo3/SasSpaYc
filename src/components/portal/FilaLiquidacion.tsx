// src/components/portal/FilaLiquidacion.tsx
import { Ban, CheckCircle2, FileText, ThumbsUp, type LucideIcon } from 'lucide-react';
import { formatMoney, formatPeriodo } from '../../lib/format';
import { ESTADO_LIQUIDACION, claseBadge, metaEstado } from '../../lib/estados';
import type { Liquidacion } from '../../services/liquidaciones.service';

/**
 * Fila del historial de liquidaciones del colaborador (`/app/comisiones`).
 *
 * Es **sólo lectura**: el colaborador no genera, aprueba, paga ni anula
 * liquidaciones. Si no está de acuerdo con una, habla con administración (la spec
 * lo pide explícitamente).
 *
 * Decisiones de dinero:
 * - `total_ventas` es la **cantidad** de ventas liquidadas, no un importe: se
 *   pinta con texto, nunca con `formatMoney`.
 * - El **saldo no lo devuelve el backend**: sólo importa aquí si queda algo por
 *   cobrar, así que se calcula `total_pagar − monto_pagado` para avisar.
 */

/** `lib/estados` guarda el nombre del ícono como string; aquí se resuelve a componente. */
const ICONOS: Record<keyof typeof ESTADO_LIQUIDACION, LucideIcon> = {
  PENDIENTE: FileText,
  APROBADA: ThumbsUp,
  PAGADA: CheckCircle2,
  ANULADA: Ban,
};

function esEstadoConocido(valor: string): valor is keyof typeof ESTADO_LIQUIDACION {
  return Object.prototype.hasOwnProperty.call(ESTADO_LIQUIDACION, valor);
}

export function FilaLiquidacion({ liquidacion }: { liquidacion: Liquidacion }) {
  const meta = metaEstado(ESTADO_LIQUIDACION, liquidacion.estado);
  const Icono = esEstadoConocido(liquidacion.estado) ? ICONOS[liquidacion.estado] : FileText;

  const saldo = Number(liquidacion.total_pagar) - Number(liquidacion.monto_pagado);
  const esPagada = liquidacion.estado === 'PAGADA';
  const esAnulada = liquidacion.estado === 'ANULADA';

  return (
    <li className="panel p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-text-primary">
            {formatPeriodo(liquidacion.periodo_inicio, liquidacion.periodo_fin)}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {liquidacion.total_ventas}{' '}
            {Number(liquidacion.total_ventas) === 1 ? 'venta liquidada' : 'ventas liquidadas'}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={`tabular text-sm font-bold ${
              esAnulada ? 'text-text-muted line-through' : 'text-text-primary'
            }`}
          >
            {formatMoney(liquidacion.total_pagar)}
          </p>
          <span className={`${claseBadge(meta.tono)} mt-1`}>
            <Icono size={12} aria-hidden="true" />
            {meta.label}
          </span>
        </div>
      </div>

      {esPagada ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-success">
          <CheckCircle2 size={12} aria-hidden="true" />
          Pagada · {formatMoney(liquidacion.monto_pagado)}
        </p>
      ) : esAnulada ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">
          <Ban size={12} aria-hidden="true" />
          Anulada: esas comisiones vuelven a estar pendientes de liquidar.
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-text-secondary">
          {Number(liquidacion.monto_pagado) > 0
            ? `Pagado ${formatMoney(liquidacion.monto_pagado)} · queda ${formatMoney(saldo)}`
            : `Pendiente de pago · ${formatMoney(saldo)}`}
        </p>
      )}

      {liquidacion.notas && (
        <p className="mt-1.5 text-[11px] text-text-muted">
          <span className="font-semibold">Nota de administración: </span>
          {liquidacion.notas}
        </p>
      )}
    </li>
  );
}

// src/components/cobros/ComandaPendienteCard.tsx
//
// Una fila de la **bandeja de cobro**: un servicio que un colaborador registró y
// que todavía no se ha cobrado.
//
// El listado de pendientes (`GET /comandas/pendientes`) ya trae, desde el
// backend, un **resumen de las líneas de cada comanda** (`items`) con el nombre
// del servicio resuelto (`servicio_nombre`) y un `comision_total` por comanda.
// Por eso esta tarjeta **no pide el detalle** de cada una: aquel N+1 ya no hace
// falta. El contrato de `src/services/comandas.service.ts` se escribió cuando el
// listado devolvía sólo la cabecera, así que los campos nuevos se declaran aquí,
// en el tipo que sí los conoce, sin tocar los servicios (que están fuera del
// alcance de este cambio).
import { CalendarClock, Flame, Hash, Sparkles, UserRound } from 'lucide-react';

import { formatMoney, formatNumero, formatRelativo, iniciales } from '../../lib/format';
import { claseBadge } from '../../lib/estados';
import {
  nombreCliente,
  totalComanda,
  type Comanda,
  type ComandaItem,
} from '../../services/comandas.service';
import { EstadoComandaBadge } from '../portal/EstadoComandaBadge';

/** A partir de cuántas horas sin cobrar se destaca la comanda como «enfriándose». */
const HORAS_ESPERA_LARGA = 2;

/** Línea de servicio tal como la devuelve el **listado** (trae el nombre resuelto). */
export type ItemListado = ComandaItem & {
  /**
   * Nombre del servicio resuelto por el backend en `adjuntarLineas`.
   * `null` sólo si el servicio ya no existe en el catálogo.
   */
  servicio_nombre?: string | null;
};

/**
 * Comanda del listado: la cabecera de siempre **más** lo que el backend añade
 * a cada fila desde que se resolvió el N+1 (`items` con nombre y `comision_total`).
 */
export type ComandaBandeja = Omit<Comanda, 'items'> & {
  items?: ItemListado[];
  comision_total?: number;
};

/** Horas transcurridas desde el servicio. `0` si la fecha no es interpretable. */
function horasEsperando(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / 3_600_000;
}

/** Nombre del servicio, con reserva explícita si el catálogo ya no lo tiene. */
function nombreServicio(item: ItemListado): string {
  return item.servicio_nombre?.trim() || `Servicio #${item.servicio_id}`;
}

export function ComandaPendienteCard({
  comanda,
  nombresColaboradores,
  onCobrar,
}: {
  comanda: ComandaBandeja;
  /** `colaborador_id → nombre`. Si falta, se pinta `#id` en vez de un hueco. */
  nombresColaboradores: ReadonlyMap<number, string>;
  onCobrar: (comanda: ComandaBandeja) => void;
}) {
  const items = comanda.items ?? [];
  const total = totalComanda(comanda);
  const espera = horasEsperando(comanda.fecha_servicio);
  const enfriandose = espera >= HORAS_ESPERA_LARGA;

  const colaborador =
    nombresColaboradores.get(comanda.colaborador_id) ?? `Colaborador #${comanda.colaborador_id}`;
  const estadoInesperado = comanda.estado !== 'pendiente';

  return (
    <article
      className={`panel overflow-hidden ${enfriandose ? 'border-warning/50' : ''}`}
      aria-label={`Comanda ${comanda.folio}`}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* ── Identificación y servicios ── */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${claseBadge('neutral')} tabular`}>
              <Hash size={12} aria-hidden="true" />
              {comanda.folio}
            </span>

            <span className={claseBadge(enfriandose ? 'warning' : 'neutral')}>
              <CalendarClock size={12} aria-hidden="true" />
              {formatRelativo(comanda.fecha_servicio)}
            </span>

            {enfriandose && (
              <span className={claseBadge('danger')}>
                <Flame size={12} aria-hidden="true" />
                Más de {formatNumero(HORAS_ESPERA_LARGA)} h sin cobrar
              </span>
            )}

            {estadoInesperado && <EstadoComandaBadge estado={comanda.estado} />}
          </div>

          <ul className="space-y-0.5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline gap-1.5 text-sm text-text-primary"
              >
                <Sparkles size={12} className="shrink-0 text-accent-from" aria-hidden="true" />
                <span className="truncate font-semibold">{nombreServicio(item)}</span>
                <span className="tabular shrink-0 text-xs text-text-muted">
                  ×{formatNumero(item.cantidad)}
                </span>
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-xs text-text-muted">
                El listado no trajo las líneas de esta comanda. Ábrela en el historial antes de
                cobrarla.
              </li>
            )}
          </ul>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
            <span className="flex items-center gap-1.5">
              <UserRound size={12} aria-hidden="true" />
              <span className="truncate">{nombreCliente(comanda)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-from/20 text-[10px] font-bold text-accent-from"
                aria-hidden="true"
              >
                {iniciales(colaborador)}
              </span>
              <span className="truncate">{colaborador}</span>
            </span>
          </div>
        </div>

        {/* ── Importe y acción ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
          <span className="tabular text-lg font-bold text-text-primary">
            {formatMoney(total)}
          </span>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onCobrar(comanda)}
            aria-label={`Cobrar la comanda ${comanda.folio} por ${formatMoney(total)}`}
          >
            Cobrar
          </button>
        </div>
      </div>
    </article>
  );
}

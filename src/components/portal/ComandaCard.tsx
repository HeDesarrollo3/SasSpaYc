// src/components/portal/ComandaCard.tsx
import { CalendarClock, ChevronDown, Info, Receipt, UserRound, XCircle } from 'lucide-react';
import { formatFechaHora, formatHora, formatMoney } from '../../lib/format';
import { claseBanner } from '../../lib/estados';
import {
  nombreCliente,
  subtotalExtras,
  subtotalLinea,
  totalComanda,
  type Comanda,
  type ComandaItem,
} from '../../services/comandas.service';
import { EstadoComandaBadge } from './EstadoComandaBadge';

/**
 * Tarjeta de un servicio registrado por el colaborador.
 *
 * Es la unidad visual de `/app` y `/app/servicios`: servicio, cliente, hora y
 * estado del cobro, con las líneas desplegables.
 *
 * ⚠️ **El nombre del servicio no viaja ni en el listado ni en el detalle.**
 * `GET /comandas` devuelve la cabecera sin líneas, y `comanda_items` guarda el
 * `servicio_id`, no el nombre. El nombre se resuelve en el cliente contra el
 * catálogo (`useCatalogoServicios()`) y llega aquí en `nombresServicios`. Si el
 * catálogo no lo tiene (servicio desactivado y borrado de la lista), se cae a
 * "Servicio #id", nunca a un hueco.
 */

/** Mapa `servicio_id → nombre` resuelto desde el catálogo. */
export type NombresServicios = ReadonlyMap<number, string>;

function nombreDe(nombres: NombresServicios | undefined, servicioId: number): string {
  return nombres?.get(servicioId) ?? `Servicio #${servicioId}`;
}

/** Título de la tarjeta: el nombre del primer servicio, con `+N` si hay más. */
function tituloServicios(items: ComandaItem[], nombres?: NombresServicios): string {
  if (items.length === 0) return 'Servicio';
  const primero = nombreDe(nombres, items[0].servicio_id);
  return items.length > 1 ? `${primero} +${items.length - 1}` : primero;
}

/** Comisión persistida de la comanda, si la base ya la congeló. */
function comisionPersistida(items: ComandaItem[]): number | null {
  const valores = items
    .map((i) => i.comision_monto)
    .filter((v): v is number => v !== null && v !== undefined);
  if (valores.length === 0) return null;
  return valores.reduce((acc, v) => acc + Number(v), 0);
}

/**
 * Comisión recalculada con lo que la base dejó guardado en la línea
 * (`base_comision` ya ajustada + `porcentaje_comision_aplicado`). Se usa sólo si
 * `comision_monto` viene nulo: es exactamente lo que calcula la RPC, sin inventar.
 */
function comisionRecalculada(items: ComandaItem[]): number | null {
  let total = 0;
  for (const i of items) {
    if (i.base_comision === null || i.porcentaje_comision_aplicado === null) return null;
    total +=
      Math.round(Number(i.base_comision) * (Number(i.porcentaje_comision_aplicado) / 100) * 100) /
      100;
  }
  return total;
}

function LineaItem({ item, nombres }: { item: ComandaItem; nombres?: NombresServicios }) {
  const extras = item.extras ?? [];
  return (
    <li className="py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-text-primary">
            {nombreDe(nombres, item.servicio_id)}
            {Number(item.cantidad) !== 1 && (
              <span className="ml-1 text-text-muted">×{item.cantidad}</span>
            )}
          </p>
          {item.notas && <p className="mt-0.5 text-[11px] text-text-muted">{item.notas}</p>}
        </div>
        <span className="tabular shrink-0 text-xs text-text-secondary">
          {formatMoney(subtotalLinea(item))}
        </span>
      </div>

      {extras.length > 0 && (
        <ul className="mt-1 space-y-0.5 pl-3">
          {extras.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 text-[11px] text-text-muted"
            >
              <span className="truncate">+ {e.descripcion}</span>
              <span className="tabular shrink-0">
                {formatMoney(Number(e.monto_unitario) * Number(e.cantidad))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ComandaCard({
  comanda,
  detalle,
  nombresServicios,
  cargandoDetalle = false,
}: {
  comanda: Comanda;
  /** Cabecera + líneas (`obtener`). Sin esto sólo se puede pintar la cabecera. */
  detalle?: Comanda;
  nombresServicios?: NombresServicios;
  cargandoDetalle?: boolean;
}) {
  const items = detalle?.items ?? [];
  const total = totalComanda(detalle ?? comanda);
  const esConfirmada = comanda.estado === 'confirmada';
  const esRechazada = comanda.estado === 'rechazada';

  const comision =
    items.length > 0 ? (comisionPersistida(items) ?? comisionRecalculada(items)) : null;
  const tieneExtras = items.some((i) => (i.extras ?? []).length > 0);

  return (
    <article className="panel overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          {items.length > 0 ? (
            <h3 className="text-sm font-bold text-text-primary">
              {tituloServicios(items, nombresServicios)}
            </h3>
          ) : cargandoDetalle ? (
            <div className="skeleton h-5 w-40" />
          ) : (
            <h3 className="text-sm font-bold text-text-primary">Servicio</h3>
          )}

          <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
            <UserRound size={12} aria-hidden="true" />
            <span className="truncate">{nombreCliente(comanda)}</span>
          </p>

          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted">
            <CalendarClock size={12} aria-hidden="true" />
            <time dateTime={comanda.fecha_servicio}>{formatHora(comanda.fecha_servicio)}</time>
            <span aria-hidden="true">·</span>
            <span className="tabular">{comanda.folio}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <EstadoComandaBadge
            estado={comanda.estado}
            importe={esConfirmada ? formatMoney(total) : undefined}
          />
          {!esConfirmada && (
            <span className="tabular text-sm font-bold text-text-primary">
              {formatMoney(total)}
            </span>
          )}
        </div>
      </div>

      {esRechazada && (
        <div className={`${claseBanner('danger')} mx-4 mb-3`} role="status">
          <XCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Rechazado por recepción</p>
            <p className="mt-0.5">{comanda.motivo_rechazo?.trim() || 'No se indicó un motivo.'}</p>
            <p className="mt-0.5 text-[11px] opacity-80">
              {comanda.rechazada_at
                ? `El ${formatFechaHora(comanda.rechazada_at)}`
                : 'Habla con administración si no lo entiendes.'}
            </p>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <details className="group border-t border-border-subtle">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[11px] font-semibold text-text-secondary">
            <span className="flex items-center gap-1.5">
              <Receipt size={12} aria-hidden="true" />
              {items.length === 1 ? 'Ver el detalle' : `Ver las ${items.length} líneas`}
            </span>
            <ChevronDown
              size={14}
              className="transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>

          <div className="px-4 pb-3">
            <ul className="divide-y divide-border-subtle">
              {items.map((item) => (
                <LineaItem key={item.id} item={item} nombres={nombresServicios} />
              ))}
            </ul>

            <div className="mt-2 space-y-1 border-t border-border-subtle pt-2 text-xs">
              {tieneExtras && (
                <p className="flex items-center justify-between text-text-muted">
                  <span>Extras incluidos</span>
                  <span className="tabular">
                    {formatMoney(items.reduce((acc, i) => acc + subtotalExtras(i), 0))}
                  </span>
                </p>
              )}
              <p className="flex items-center justify-between text-text-secondary">
                <span>{esConfirmada ? 'Total cobrado' : 'Total estimado'}</span>
                <span className="tabular font-bold text-text-primary">{formatMoney(total)}</span>
              </p>

              {comision !== null ? (
                <p className="flex items-center justify-between text-text-secondary">
                  <span>Tu comisión {esConfirmada ? '' : 'estimada'}</span>
                  <span className="tabular font-semibold text-accent-from">
                    {formatMoney(comision)}
                  </span>
                </p>
              ) : (
                esConfirmada && (
                  <p className="flex items-start gap-1.5 text-[11px] text-text-muted">
                    <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      La comisión de este servicio todavía no está calculada. Aparecerá al
                      generarse la liquidación.
                    </span>
                  </p>
                )
              )}
            </div>
          </div>
        </details>
      )}
    </article>
  );
}

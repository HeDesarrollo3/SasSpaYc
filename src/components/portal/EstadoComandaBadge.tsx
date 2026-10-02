// src/components/portal/EstadoComandaBadge.tsx
import { Ban, CheckCircle2, CircleDashed, Clock, XCircle, type LucideIcon } from 'lucide-react';
import { ESTADO_COMANDA, claseBadge, metaEstado } from '../../lib/estados';
import type { ComandaEstado } from '../../services/comandas.service';

/**
 * Íconos por estado de comanda.
 *
 * `lib/estados` guarda el **nombre** del ícono como string para no acoplar el
 * módulo de dominio a `lucide-react`; aquí se resuelve con un mapa tipado cuyos
 * valores son componentes importados. Así un estado nuevo rompe la compilación en
 * vez de pintar un hueco.
 */
const ICONOS: Record<ComandaEstado, LucideIcon> = {
  borrador: CircleDashed,
  pendiente: Clock,
  confirmada: CheckCircle2,
  rechazada: XCircle,
  anulada: Ban,
};

/** `true` si el valor es uno de los estados reales de `comandas.estado`. */
function esEstadoComanda(valor: string): valor is ComandaEstado {
  return Object.prototype.hasOwnProperty.call(ESTADO_COMANDA, valor);
}

/**
 * Badge de estado de una comanda. Siempre **ícono + texto**, nunca sólo color
 * (regla de accesibilidad del design system §9).
 *
 * Si llega un estado desconocido, `metaEstado` cae a un badge neutro con el texto
 * crudo y se sigue pintando: la pantalla no se rompe por un valor nuevo en la base.
 */
export function EstadoComandaBadge({
  estado,
  importe,
}: {
  estado: string;
  /** Importe cobrado, para el caso `confirmada` ("Cobrado · $24.00"). */
  importe?: string;
}) {
  const meta = metaEstado(ESTADO_COMANDA, estado);
  const Icono = esEstadoComanda(estado) ? ICONOS[estado] : CircleDashed;

  return (
    <span className={claseBadge(meta.tono)}>
      <Icono size={12} aria-hidden="true" />
      {meta.label}
      {importe ? ` · ${importe}` : ''}
    </span>
  );
}

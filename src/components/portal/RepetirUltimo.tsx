// src/components/portal/RepetirUltimo.tsx
//
// «Repetir último»: el atajo que convierte el registro en dos toques.
//
// Registrar es la acción que sostiene todo el portal (spec §3.18: menos de 30
// segundos). Si el colaborador repite el mismo servicio diez veces al día, el
// camino no puede empezar por buscar el servicio en una lista de cien.
//
// Lleva al asistente con el servicio **preseleccionado** por `state` de React
// Router (sin query string: no ensucia la URL ni el historial del navegador, y
// `NuevoServicioPage` lo lee de `useLocation()`).
//
// No se pinta si no hay historial: un atajo a nada es ruido.
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';

import { formatMoney, formatNumero } from '../../lib/format';

/** Lo mínimo para ofrecer el atajo. El precio es el del catálogo de hoy. */
interface ServicioParaRepetir {
  id: number;
  nombre: string;
  /** Precio actual del catálogo; `0` si no se pudo resolver (entonces no se pinta). */
  precio: number;
  /** `null` cuando el servicio no tiene duración configurada. */
  duracionMinutos: number | null;
}

export function RepetirUltimo({ servicio }: { servicio: ServicioParaRepetir | null }) {
  if (!servicio) return null;

  // La duración se calla si no existe: preferimos una línea corta a un «— min».
  const detalles = [
    servicio.duracionMinutos !== null && servicio.duracionMinutos > 0
      ? `${formatNumero(servicio.duracionMinutos)} min`
      : null,
    servicio.precio > 0 ? formatMoney(servicio.precio) : null,
  ].filter((t): t is string => t !== null);

  return (
    <Link
      to="/app/nuevo"
      state={{ servicioId: servicio.id }}
      className="flex min-h-12 items-center justify-between gap-3 rounded-sm border border-border-subtle bg-surface-card px-3 py-2"
      aria-label={`Repetir el último servicio: ${servicio.nombre}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <RotateCcw size={14} className="shrink-0 text-accent-from" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-label uppercase tracking-wide text-text-muted">
            Repetir último
          </span>
          <span className="block truncate text-body text-text-primary">{servicio.nombre}</span>
        </span>
      </span>
      {detalles.length > 0 && (
        <span className="tabular shrink-0 text-label text-text-secondary">
          {detalles.join(' · ')}
        </span>
      )}
    </Link>
  );
}

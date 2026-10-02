// src/components/portal/ChipsMasUsados.tsx
//
// «Más usados»: hasta tres servicios que el colaborador registra una y otra vez,
// como chips que abren el asistente con el servicio **preseleccionado**.
//
// El conteo sale del propio historial de comandas (`items[].servicio_id`), no de
// una lista de favoritos que nadie mantiene: lo que más usa es, por definición,
// lo que más ha registrado.
//
// Los chips son `<Link>` con `btn-secondary` (el botón secundario del design
// system) y `min-h-12`: 48 px de área táctil, que es la regla del portal porque
// se usa de pie y con una mano.
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

import { formatNumero } from '../../lib/format';

interface ServicioUsado {
  id: number;
  nombre: string;
  /** Cuántas veces lo ha registrado. Se enseña sólo si es más de una. */
  veces: number;
}

export function ChipsMasUsados({ servicios }: { servicios: ServicioUsado[] }) {
  if (servicios.length === 0) return null;

  return (
    <div>
      <p className="text-label uppercase tracking-wide text-text-muted">Más usados</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {servicios.map((s) => (
          <li key={s.id} className="min-w-0">
            <Link
              to="/app/nuevo"
              state={{ servicioId: s.id }}
              className="btn-secondary min-h-12 max-w-full rounded-full"
              aria-label={
                s.veces > 1
                  ? `Registrar de nuevo ${s.nombre} (lo has hecho ${formatNumero(s.veces)} veces)`
                  : `Registrar ${s.nombre}`
              }
            >
              <Sparkles size={14} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{s.nombre}</span>
              {s.veces > 1 && (
                <span className="tabular shrink-0 text-text-muted">
                  ×{formatNumero(s.veces)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

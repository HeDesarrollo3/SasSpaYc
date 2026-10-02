// src/components/dashboard/SinMetas.tsx
//
// Estado vacío del apartado de metas: **ninguna** meta está definida.
//
// No se oculta la sección a propósito. Si desapareciera, el dueño no sabría que
// existe la posibilidad de fijar objetivos y seguiría sin ver nunca este
// apartado. Un hueco explicado vale más que un hueco invisible.
import { Link } from 'react-router-dom';
import { Info, Settings, Target } from 'lucide-react';

export function SinMetas({
  /**
   * `false` si ni siquiera se pudo leer `/parametros/formato`. En ese caso puede
   * haber metas guardadas que no se están mostrando, y decirlo es más honesto
   * que afirmar que no hay ninguna.
   */
  configuracionLeida,
}: {
  configuracionLeida: boolean;
}) {
  return (
    <div className="panel p-6">
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-accent-from"
          aria-hidden="true"
        >
          <Target size={20} />
        </span>

        <div className="min-w-0">
          <p className="text-body font-semibold text-text-primary">
            Todavía no hay ninguna meta definida
          </p>
          <p className="mt-1 text-body-sm text-text-secondary">
            Una meta es el objetivo que quieres alcanzar: cuánto facturar al mes, cuánto al día,
            cuántos servicios cobrar y qué ticket medio buscar. Con ellas, el panel no sólo te dice
            cuánto llevas, sino <strong>a qué ritmo tienes que ir</strong> para llegar: un 40 % el
            día 3 del mes es ir por delante; ese mismo 40 % el día 25 es ir muy por detrás.
          </p>

          {!configuracionLeida && (
            <p className="mt-2 flex items-start gap-1.5 text-label text-warning-text">
              <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              No se pudo leer la configuración del negocio, así que puede que haya metas guardadas
              que no se están mostrando. Comprueba la conexión y vuelve a cargar la página.
            </p>
          )}

          <Link to="/settings#metas" className="btn-secondary mt-4">
            <Settings size={14} aria-hidden="true" />
            Definir metas en Ajustes
          </Link>
        </div>
      </div>
    </div>
  );
}

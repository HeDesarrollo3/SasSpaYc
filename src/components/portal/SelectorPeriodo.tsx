// src/components/portal/SelectorPeriodo.tsx
//
// `Día · Semana · Mes`: qué periodo se mide y contra qué meta.
//
// ## Por qué existe
// El portal medía **sólo la semana en curso** y sólo pintaba la meta **diaria**.
// Una meta semanal era, en la práctica, invisible: se guardaba y no se veía en
// ninguna pantalla. Con este selector cada periodo tiene dónde vivir y la meta
// que le corresponde (`elegirMetaDelPeriodo`).
//
// ## Las marcas de «Con meta»
// Un botón que dice «Semana» no dice si ahí hay algo. La marca sale de
// `periodosConMeta` (lógica pura, probada con Node). Es **ícono + texto**, nunca
// un punto de color: el color solo no comunica. Mientras las metas están
// cargando no se marca ninguna —la marca es una ayuda, no un dato— y el avance
// de abajo sí enseña su esqueleto, que es donde importa.
import { Target } from 'lucide-react';

import { PERIODOS_META, etiquetaPeriodoCorta, type MetaPeriodo } from './metaAvance';

interface Props {
  valor: MetaPeriodo;
  onCambiar: (periodo: MetaPeriodo) => void;
  /**
   * Periodos con meta vigente, o `null` si todavía no se sabe (cargando o error).
   * `null` y `[]` significan cosas distintas: «no lo sé» y «ninguno».
   */
  conMeta: readonly MetaPeriodo[] | null;
}

export function SelectorPeriodo({ valor, onCambiar, conMeta }: Props) {
  return (
    <div role="group" aria-label="Periodo que quieres ver" className="grid grid-cols-3 gap-2">
      {PERIODOS_META.map((periodo) => {
        const activo = periodo === valor;
        const tieneMeta = conMeta?.includes(periodo) ?? false;

        return (
          <button
            key={periodo}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambiar(periodo)}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-sm border px-2 text-label transition-colors ${
              activo
                ? 'border-accent-from bg-accent-from/10 text-text-primary'
                : 'border-border-subtle bg-surface-card text-text-secondary'
            }`}
          >
            <span>{etiquetaPeriodoCorta(periodo)}</span>
            {tieneMeta && (
              <span className="flex items-center gap-1 text-accent-from">
                <Target size={11} aria-hidden="true" />
                Con meta
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

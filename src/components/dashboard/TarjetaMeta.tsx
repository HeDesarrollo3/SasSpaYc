// src/components/dashboard/TarjetaMeta.tsx
//
// Una meta **definida** (> 0) con su seguimiento.
//
// ## Por qué el color no mira sólo el porcentaje
// Un `40 %` no significa nada por sí solo: el día 3 del mes es ir muy por
// delante y el día 25 es ir muy por detrás. Por eso la tarjeta compara lo que
// llevas con **lo que deberías llevar a estas alturas del periodo**
// (`fraccionPeriodo`) y colorea según esa comparación, no según el `%`.
//
// ## `0` significa «sin meta definida»
// Esta tarjeta **nunca** debe usarse con `meta <= 0`: pintaría una barra contra
// cero y un `100 %` falso. Quien la usa filtra antes (`SeccionMetas` pinta
// `TarjetaMetaVacia` en su lugar).
import type { ReactNode } from 'react';
import { CheckCircle2, Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';

import { claseBadge, type Tono } from '../../lib/estados';
import { formatMoney, formatNumero } from '../../lib/format';
import { BarraProgreso } from './BarraProgreso';

/** Dinero (`$100.000`) o volumen (`12`). El volumen **jamás** se formatea con `formatMoney`. */
export type TipoMeta = 'moneda' | 'numero';

/** Cómo va el negocio frente al periodo. */
export type Ritmo = 'cumplida' | 'adelantado' | 'a-ritmo' | 'atrasado';

/**
 * Evalúa el avance **contra el ritmo esperado**, no contra el objetivo final.
 *
 * @param fraccionPeriodo Fracción del periodo ya transcurrida (0–1). `null`
 *   cuando el dato no es acumulativo (el ticket medio es un promedio, no una
 *   suma: no «avanza» con las horas) y sólo cabe compararlo con el objetivo.
 */
function evaluarRitmo(actual: number, meta: number, fraccionPeriodo: number | null): Ritmo {
  if (meta <= 0) return 'a-ritmo';
  if (actual >= meta) return 'cumplida';

  if (fraccionPeriodo === null) {
    // Sin referencia temporal: hasta un 10 % por debajo del objetivo es «cerca».
    return actual / meta >= 0.9 ? 'a-ritmo' : 'atrasado';
  }

  const esperado = meta * Math.min(Math.max(fraccionPeriodo, 0), 1);

  // Periodo sin empezar (de madrugada, día 1): no se puede ir «por detrás» de 0.
  if (esperado <= 0) return actual > 0 ? 'adelantado' : 'a-ritmo';

  const ratio = actual / esperado;
  if (ratio >= 1) return 'adelantado';
  // Margen del 15 %: ir un poco por debajo del ritmo no es un incendio, pero
  // tampoco es ir bien. El color avisa antes de que sea tarde para reaccionar.
  if (ratio >= 0.85) return 'a-ritmo';
  return 'atrasado';
}

/**
 * Estado del ritmo: tono, ícono y texto. **Nunca sólo color** (un usuario con
 * daltonismo tiene que poder distinguirlo).
 *
 * `ritmo` y `objetivo` son las dos redacciones posibles: para las metas
 * acumulativas se habla de ritmo; para el ticket medio, de objetivo.
 */
const ESTADOS = {
  cumplida: {
    tono: 'success',
    Icono: CheckCircle2,
    ritmo: 'Meta cumplida',
    objetivo: 'Meta cumplida',
  },
  adelantado: {
    tono: 'success',
    Icono: TrendingUp,
    ritmo: 'Por delante del ritmo',
    objetivo: 'Por encima del objetivo',
  },
  'a-ritmo': {
    tono: 'warning',
    Icono: Minus,
    ritmo: 'En línea con el ritmo',
    objetivo: 'Cerca del objetivo',
  },
  atrasado: {
    tono: 'danger',
    Icono: TrendingDown,
    ritmo: 'Por detrás del ritmo',
    objetivo: 'Por debajo del objetivo',
  },
} as const satisfies Record<
  Ritmo,
  { tono: Tono; Icono: LucideIcon; ritmo: string; objetivo: string }
>;

export interface TarjetaMetaProps {
  titulo: string;
  icono: LucideIcon;
  actual: number;
  /** Siempre `> 0`: si es `0` la meta no está definida y no se pinta esta tarjeta. */
  meta: number;
  tipo: TipoMeta;
  fraccionPeriodo: number | null;
  /** Redacción del estado. `ritmo` por defecto; `objetivo` para el ticket medio. */
  referencia?: 'ritmo' | 'objetivo';
  /** Líneas de contexto: cuánto falta, ritmo necesario, días restantes… */
  contexto?: ReactNode;
  cargando?: boolean;
}

export function TarjetaMeta({
  titulo,
  icono: Icono,
  actual,
  meta,
  tipo,
  fraccionPeriodo,
  referencia = 'ritmo',
  contexto,
  cargando = false,
}: TarjetaMetaProps) {
  const formatear = tipo === 'moneda' ? formatMoney : formatNumero;

  if (cargando) {
    return (
      <article className="panel flex h-full flex-col p-4" aria-busy="true">
        <span className="sr-only">Cargando el avance de {titulo}…</span>
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton mt-3 h-6 w-1/2" />
        <div className="skeleton mt-3 h-2 w-full" />
        <div className="skeleton mt-3 h-3 w-3/4" />
      </article>
    );
  }

  const ritmo = evaluarRitmo(actual, meta, fraccionPeriodo);
  const { tono, Icono: IconoRitmo } = ESTADOS[ritmo];
  const etiquetaRitmo = ESTADOS[ritmo][referencia];
  const falta = Math.max(meta - actual, 0);

  return (
    <article className="panel flex h-full flex-col p-4" aria-label={`Meta de ${titulo}`}>
      <div className="flex flex-col items-start gap-2">
        <span className="flex items-center gap-2 text-body-sm font-semibold text-text-primary">
          <Icono size={16} className="shrink-0 text-accent-from" aria-hidden="true" />
          {titulo}
        </span>
        <span className={`${claseBadge(tono)} whitespace-nowrap`}>
          <IconoRitmo size={12} aria-hidden="true" />
          {etiquetaRitmo}
        </span>
      </div>

      <p className="tabular mt-3 text-h2 text-text-primary">{formatear(actual)}</p>

      <BarraProgreso
        className="mt-3"
        valor={actual}
        maximo={meta}
        tono={tono}
        etiqueta={`${titulo}: ${formatear(actual)} de ${formatear(meta)}`}
        textoValor={`${formatear(actual)} de ${formatear(meta)}`}
      />

      <p className="mt-2 text-body-sm text-text-secondary">
        Meta: <span className="tabular font-semibold text-text-primary">{formatear(meta)}</span>
        {falta > 0 ? (
          <>
            {' · '}faltan{' '}
            <span className="tabular font-semibold text-text-primary">{formatear(falta)}</span>
          </>
        ) : (
          <> · conseguida</>
        )}
      </p>

      {contexto && <div className="mt-2 space-y-1 text-label text-text-muted">{contexto}</div>}
    </article>
  );
}

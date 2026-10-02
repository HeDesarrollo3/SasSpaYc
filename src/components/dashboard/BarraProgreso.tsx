// src/components/dashboard/BarraProgreso.tsx
//
// Barra de progreso del panel de metas. Se construye con dos `div` y Tailwind:
// el proyecto **no** añade una librería de gráficos para esto.
//
// El único `style` en línea es el ancho: es un valor dinámico de runtime y no
// existe una utilidad de Tailwind capaz de expresar «el 43,7 %».
import { formatPorcentaje } from '../../lib/format';

export type TonoProgreso = 'success' | 'warning' | 'danger';

/** Relleno por tono. El color **nunca** comunica solo: siempre acompaña a texto. */
const RELLENO: Record<TonoProgreso, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/**
 * Avance en porcentaje, **acotado a 0–100**.
 *
 * ⚠️ Devuelve `0` cuando `maximo <= 0` en vez de `Infinity`/`NaN`. En este
 * dominio una meta a `0` significa «sin meta definida»: pintar un `100 %` contra
 * cero sería decirle al dueño que ha cumplido un objetivo que nadie fijó.
 */
function porcentaje(valor: number, maximo: number): number {
  if (!Number.isFinite(valor) || !Number.isFinite(maximo) || maximo <= 0) return 0;
  return Math.min(100, Math.max(0, (valor / maximo) * 100));
}

/**
 * Barra de progreso accesible con su porcentaje al lado.
 *
 * El `porcentaje` lo calcula **aquí** y no quien la usa, para que el ancho
 * pintado, el `%` visible y el `aria-valuenow` no puedan divergir.
 *
 * @param etiqueta `aria-label`: describe **qué** mide la barra.
 * @param textoValor `aria-valuetext`: los números ya formateados, porque
 *   `aria-valuenow` viaja en crudo (un lector diría «1234000» en vez de
 *   «$1.234.000»).
 */
export function BarraProgreso({
  valor,
  maximo,
  tono,
  etiqueta,
  textoValor,
  className = '',
}: {
  valor: number;
  maximo: number;
  tono: TonoProgreso;
  etiqueta: string;
  textoValor?: string;
  className?: string;
}) {
  const pct = porcentaje(valor, maximo);
  const techo = Math.max(0, Math.round(maximo));
  const ahora = techo > 0 ? Math.min(Math.max(Math.round(valor), 0), techo) : 0;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        role="progressbar"
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={techo}
        aria-valuenow={ahora}
        aria-valuetext={textoValor}
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-elevated"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${RELLENO[tono]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/*
        El porcentaje visible va oculto a accesibilidad: la barra ya expone el
        mismo dato (y mejor) con `aria-valuenow`/`aria-valuetext`.
      */}
      <span
        className="tabular w-10 shrink-0 text-right text-label text-text-secondary"
        aria-hidden="true"
      >
        {formatPorcentaje(pct, 0)}
      </span>
    </div>
  );
}

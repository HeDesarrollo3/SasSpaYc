// src/components/portal/MetaCard.tsx
//
// Una meta en la lista de `/app/metas`.
//
// Distingue **de quién es** la meta, porque cambia lo que se puede hacer con ella:
//
//   · `personal`  → la fija el colaborador. Se puede editar, pausar y borrar.
//   · `administracion` → la fija el negocio. **Sólo lectura**: no se toca desde
//     el portal, y el bono (que sólo existe en éstas) es informativo.
//
// ## Por qué no hay campo de bono en las personales
// El `CHECK` `metas_bono_solo_administracion` de la base **rechaza** una meta
// `personal` con `bono`. Un campo que la base va a rechazar no se enseña: una
// meta personal es una intención, no un contrato.
import { useId } from 'react';
import { Award, Lock, Pause, Pencil, Play, Trash2 } from 'lucide-react';

import { formatFecha, formatMoney, formatNumero } from '../../lib/format';
import { claseBadge } from '../../lib/estados';
import { etiquetaPeriodo, etiquetaTipo, unidadDeTipo, type MetaFila } from './metaAvance';

/**
 * `'2026-01-01'` → `01 ene 2026`.
 *
 * Las columnas `vigente_desde` / `vigente_hasta` son `date` **sin hora**, y
 * `new Date('2026-01-01')` se interpreta como medianoche UTC: al formatearla en
 * la zona del negocio (UTC−5) saldría el 31 de diciembre. Se le añade mediodía
 * para que el día no se mueva.
 */
function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatFecha(`${iso.slice(0, 10)}T12:00:00`);
}

interface Props {
  meta: MetaFila;
  /** `true` = meta personal del colaborador y la base deja escribir: se puede editar. */
  editable: boolean;
  /**
   * Qué explicar cuando no es editable. Son dos motivos distintos y decir el
   * equivocado confunde: una meta personal bloqueada por permisos **no** la fija
   * administración.
   */
  notaSoloLectura?: string;
  /** `true` mientras hay una mutación en vuelo para esta meta. */
  ocupada: boolean;
  onEditar: (meta: MetaFila) => void;
  onAlternarActiva: (meta: MetaFila) => void;
  onBorrar: (meta: MetaFila) => void;
}

export function MetaCard({
  meta,
  editable,
  notaSoloLectura,
  ocupada,
  onEditar,
  onAlternarActiva,
  onBorrar,
}: Props) {
  const idTitulo = useId();
  const formatear = unidadDeTipo(meta.tipo) === 'moneda' ? formatMoney : formatNumero;
  const bono = meta.bono === null || meta.bono === undefined ? null : Number(meta.bono);

  const vigencia = meta.vigente_hasta
    ? `${fechaCorta(meta.vigente_desde)} – ${fechaCorta(meta.vigente_hasta)}`
    : `Desde el ${fechaCorta(meta.vigente_desde)}`;

  return (
    <article className="panel p-4" aria-labelledby={idTitulo} aria-busy={ocupada}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={idTitulo} className="text-body font-semibold text-text-primary">
            {etiquetaTipo(meta.tipo)}
          </h3>
          <p className="mt-0.5 text-body-sm text-text-muted">
            {etiquetaPeriodo(meta.periodo)} · {vigencia}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={claseBadge(meta.origen === 'personal' ? 'accent' : 'info')}>
            {meta.origen === 'personal' ? 'Personal' : 'Del negocio'}
          </span>
          {!meta.activa && (
            <span className={claseBadge('neutral')}>
              <Pause size={12} aria-hidden="true" />
              En pausa
            </span>
          )}
        </div>
      </div>

      <p className="tabular mt-3 text-h2 text-text-primary">{formatear(Number(meta.objetivo))}</p>
      <p className="mt-0.5 text-body-sm text-text-secondary">
        {unidadDeTipo(meta.tipo) === 'moneda'
          ? 'de comisión en el periodo'
          : 'servicios en el periodo'}
      </p>

      {/*
        El bono sólo puede venir de administración. Se enseña como información
        («esto te lo propuso el spa»), nunca como algo que el colaborador se
        asigne: sería un contrato consigo mismo.
      */}
      {bono !== null && bono > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-body-sm text-warning-text">
          <Award size={14} className="shrink-0" aria-hidden="true" />
          <span>
            Bono de <span className="tabular font-semibold">{formatMoney(bono)}</span> si la
            cumples (lo fija administración).
          </span>
        </p>
      )}

      {editable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary min-h-12 flex-1"
            onClick={() => onEditar(meta)}
            disabled={ocupada}
          >
            <Pencil size={14} aria-hidden="true" />
            Editar
          </button>
          <button
            type="button"
            className="btn-ghost min-h-12 flex-1"
            onClick={() => onAlternarActiva(meta)}
            disabled={ocupada}
          >
            {meta.activa ? (
              <>
                <Pause size={14} aria-hidden="true" />
                Pausar
              </>
            ) : (
              <>
                <Play size={14} aria-hidden="true" />
                Activar
              </>
            )}
          </button>
          <button
            type="button"
            className="btn-ghost min-h-12 text-danger-text"
            onClick={() => onBorrar(meta)}
            disabled={ocupada}
            aria-label={`Borrar la meta de ${etiquetaTipo(meta.tipo)}`}
          >
            <Trash2 size={14} aria-hidden="true" />
            Borrar
          </button>
        </div>
      ) : notaSoloLectura ? (
        <p className="mt-4 flex items-start gap-1.5 text-body-sm text-text-muted">
          <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{notaSoloLectura}</span>
        </p>
      ) : null}
    </article>
  );
}

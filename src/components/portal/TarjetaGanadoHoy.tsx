// src/components/portal/TarjetaGanadoHoy.tsx
//
// La **tarjeta hero** de `/app`: cuánto llevas ganado hoy, cuánto está todavía
// por confirmar y cómo vas contra la meta del día.
//
// Sustituye a los dos recuadros («Hoy has registrado» / «Cobrado hoy») porque
// separados obligaban a sumar de cabeza: el colaborador quiere un número, no dos.
//
// ## Las tres cosas que esta tarjeta NO hace
// 1. **No pinta una barra sin meta.** Una barra contra cero sale al 100 % y diría
//    que se ha cumplido un objetivo que nadie fijó. Sin meta: un enlace discreto
//    para definirla.
// 2. **No pinta un `0` que no es un dato.** Mientras carga, esqueleto; si falló,
//    `—`. Un `$0` en error es indistinguible de «no he ganado nada hoy».
// 3. **No mezcla unidades.** La meta de comisión se mide en pesos y la de
//    servicios en número; cada una dice en qué unidad va.
//
// La barra es `BarraProgreso` (ya usada en el panel de metas): calcula el
// porcentaje en un solo sitio, lo acota a 0–100 y expone `role="progressbar"` con
// `aria-valuenow`/`aria-valuemax`/`aria-valuetext`.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Info, Target } from 'lucide-react';

import { formatMoney } from '../../lib/format';
import { esTipoMedible, etiquetaTipo, type MetaFila } from './metaAvance';
import { AvanceMeta } from './AvanceMeta';

/** Estimación de lo que recepción todavía no ha cobrado. */
interface PorConfirmar {
  /** `null` = no se pudo estimar (falta el porcentaje de algún servicio). */
  monto: number | null;
  /** `true` si hay algún servicio pendiente de cobro hoy. */
  hay: boolean;
  /** `true` si algún pendiente se quedó sin estimar, así que el total es un mínimo. */
  parcial: boolean;
  cargando: boolean;
  error: boolean;
}

interface Props {
  /** Comisión ya confirmada hoy. `null` = falló la lectura: se pinta `—`. */
  ganado: number | null;
  cargando: boolean;
  porConfirmar: PorConfirmar;
  /** Meta del día. `null` = no hay meta activa. */
  meta: MetaFila | null;
  metaCargando: boolean;
  metaError: boolean;
  /** `false` sin ficha de colaborador: no se invita a crear una meta personal. */
  puedeDefinirMeta: boolean;
  /** Servicios de hoy ya cobrados (volumen, para las metas de tipo `servicios`). */
  serviciosConfirmados: number;
}

/** Enlace discreto a la pantalla de metas. Área táctil de 48 px. */
function EnlaceMetas({ texto, icono }: { texto: string; icono?: ReactNode }) {
  return (
    <Link
      to="/app/metas"
      className="inline-flex min-h-12 items-center gap-1.5 text-label text-accent-from"
    >
      {icono}
      {texto}
      <ChevronRight size={14} aria-hidden="true" />
    </Link>
  );
}

/**
 * Bloque de avance contra la meta del día.
 *
 * El cálculo y el texto viven en `AvanceMeta`, compartido con `/app/comisiones`
 * (que mide el periodo que elija el colaborador): aquí sólo se fija el periodo.
 * Antes estaba duplicado en este archivo con los textos atados al día.
 */
function AvanceDeLaMeta({
  meta,
  ganado,
  serviciosConfirmados,
}: {
  meta: MetaFila;
  ganado: number;
  serviciosConfirmados: number;
}) {
  return (
    <AvanceMeta
      meta={meta}
      datos={{ confirmado: ganado, serviciosConfirmados }}
      periodo="dia"
    />
  );
}

export function TarjetaGanadoHoy({
  ganado,
  cargando,
  porConfirmar,
  meta,
  metaCargando,
  metaError,
  puedeDefinirMeta,
  serviciosConfirmados,
}: Props) {
  // Sin meta, sin objetivo o sin dato de hoy **no hay barra**: se explica en su
  // lugar. Calcular el avance aquí y no en el JSX mantiene la decisión en un
  // único punto.
  const medible =
    meta !== null &&
    esTipoMedible(meta.tipo) &&
    ganado !== null &&
    Number(meta.objetivo) > 0;

  let zonaMeta: ReactNode;
  if (metaCargando) {
    zonaMeta = (
      <div className="mt-3 space-y-2" aria-hidden="true">
        <div className="skeleton h-2 w-full" />
        <div className="skeleton h-4 w-40" />
      </div>
    );
  } else if (metaError) {
    zonaMeta = (
      <>
        <p className="mt-3 text-body-sm text-text-muted">No pudimos leer tu meta de hoy.</p>
        <EnlaceMetas texto="Ver mis metas" />
      </>
    );
  } else if (meta === null) {
    zonaMeta = puedeDefinirMeta ? (
      <EnlaceMetas texto="Definir mi meta" icono={<Target size={14} aria-hidden="true" />} />
    ) : null;
  } else if (!esTipoMedible(meta.tipo)) {
    zonaMeta = (
      <>
        <p className="mt-3 text-body-sm text-text-muted">
          Tu meta de hoy es de otro tipo ({etiquetaTipo(meta.tipo)}) y este resumen no la mide.
        </p>
        <EnlaceMetas texto="Ver mis metas" />
      </>
    );
  } else if (!medible) {
    zonaMeta = (
      <>
        <p className="mt-3 text-body-sm text-text-muted">No pudimos calcular tu avance de hoy.</p>
        <EnlaceMetas texto="Ver mi meta" />
      </>
    );
  } else {
    zonaMeta = (
      <div className="mt-3">
        <AvanceDeLaMeta
          meta={meta}
          ganado={ganado ?? 0}
          serviciosConfirmados={serviciosConfirmados}
        />
      </div>
    );
  }

  return (
    <section className="glass-card p-4" aria-labelledby="hero-ganado-hoy">
      <h2 id="hero-ganado-hoy" className="text-label uppercase tracking-wide text-text-muted">
        Ganado hoy <span className="normal-case">(confirmado)</span>
      </h2>

      {cargando ? (
        <div className="skeleton mt-2 h-10 w-44" aria-hidden="true" />
      ) : (
        <p className="tabular mt-1 text-display text-text-primary" aria-live="polite">
          {ganado === null ? '—' : formatMoney(ganado)}
        </p>
      )}

      {zonaMeta}

      <div className="mt-4 border-t border-border-subtle pt-3" aria-live="polite">
        {porConfirmar.cargando ? (
          <div className="skeleton h-4 w-48" aria-hidden="true" />
        ) : !porConfirmar.hay ? (
          <p className="text-body-sm text-text-muted">
            Nada por confirmar hoy: lo registrado ya está cobrado.
          </p>
        ) : porConfirmar.error || porConfirmar.monto === null ? (
          <p className="text-body-sm text-text-muted">
            Por confirmar: <span className="font-semibold">—</span> · no pudimos estimarlo. Se
            actualizará cuando recepción cobre.
          </p>
        ) : (
          <>
            <p className="text-body-sm text-text-secondary">
              Por confirmar:{' '}
              <span className="tabular font-semibold text-text-primary">
                ~{formatMoney(porConfirmar.monto)}
              </span>
              {porConfirmar.parcial && (
                <span className="text-text-muted"> (mínimo: falta algún porcentaje)</span>
              )}
            </p>
            {/*
              La aclaración no es letra pequeña decorativa: es la diferencia entre
              una promesa y una estimación. Caja puede aplicar un descuento al
              cobrar y este número baja.
            */}
            <p className="mt-0.5 flex items-start gap-1.5 text-label text-text-muted">
              <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Es un <strong>estimado</strong>: si caja aplica un descuento al cobrar, bajará.
              </span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

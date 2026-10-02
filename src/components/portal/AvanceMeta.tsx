// src/components/portal/AvanceMeta.tsx
//
// **Cómo vas contra la meta de un periodo**: la barra, el objetivo y lo que
// falta. Es un bloque, no una tarjeta: lo pintan el resumen de inicio (periodo
// `dia`) y `/app/comisiones` (el periodo que elija el colaborador).
//
// ## Por qué está extraído y no duplicado
// Antes vivía dentro de `TarjetaGanadoHoy` con los textos atados al día
// («Meta de hoy», «Meta del día cumplida»). Con tres periodos, copiarlo habría
// dejado dos sitios donde decidir cómo se llama la meta y cuándo se cumple; el
// texto sale de `tituloMetaDelPeriodo` / `textoMetaCumplida`, que son puros y se
// prueban con Node.
//
// ## Lo que este bloque NO hace
// No decide **si** hay que pintar barra: eso es de quien lo usa, porque depende
// de si los datos del periodo llegaron (un `$0` mientras carga sería un dato
// falso). Aquí llega un `datos` ya completo, o no se llama.
import { CheckCircle2 } from 'lucide-react';

import { formatMoney, formatNumero } from '../../lib/format';
import { BarraProgreso } from '../dashboard/BarraProgreso';
import {
  avanceDelPeriodo,
  textoMetaCumplida,
  tituloMetaDelPeriodo,
  type DatosDelPeriodo,
  type MetaFila,
  type MetaPeriodo,
} from './metaAvance';

interface Props {
  /** La meta **de ese periodo** (`elegirMetaDelPeriodo`), no cualquier meta. */
  meta: MetaFila;
  /** Lo conseguido en el periodo, en las dos unidades medibles. */
  datos: DatosDelPeriodo;
  /** Periodo medido: decide los textos y contra qué se compara. */
  periodo: MetaPeriodo;
}

export function AvanceMeta({ meta, datos, periodo }: Props) {
  const avance = avanceDelPeriodo(meta, datos);
  // La unidad manda en el formato: un `$` en un conteo de servicios sería un
  // error, y `formatNumero` no pone símbolo.
  const formatear = avance.unidad === 'moneda' ? formatMoney : formatNumero;
  const unidad = avance.unidad === 'moneda' ? 'comisión' : 'servicios';
  const titulo = tituloMetaDelPeriodo(periodo);

  return (
    <>
      <BarraProgreso
        valor={avance.valor}
        maximo={avance.maximo}
        // El color acompaña al texto, nunca lo sustituye: debajo va el estado
        // escrito con su ícono.
        tono={avance.cumplida ? 'success' : 'warning'}
        etiqueta={`${titulo} (${unidad}): ${formatear(avance.valor)} de ${formatear(avance.maximo)}`}
        textoValor={`${formatear(avance.valor)} de ${formatear(avance.maximo)}`}
      />

      <p className="mt-2 text-body-sm text-text-secondary">
        {titulo} <span className="text-text-muted">({unidad})</span>:{' '}
        <span className="tabular font-semibold text-text-primary">
          {formatear(avance.maximo)}
        </span>
        {!avance.cumplida && (
          <>
            {' · te faltan '}
            <span className="tabular font-semibold text-text-primary">
              {formatear(avance.falta)}
            </span>
          </>
        )}
      </p>

      {avance.cumplida && (
        <p className="mt-1 flex items-center gap-1.5 text-body-sm text-success-text">
          <CheckCircle2 size={14} aria-hidden="true" />
          <span>{textoMetaCumplida(periodo)}</span>
        </p>
      )}
    </>
  );
}

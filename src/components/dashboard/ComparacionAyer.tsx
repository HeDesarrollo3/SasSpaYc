// src/components/dashboard/ComparacionAyer.tsx
//
// «Hoy vas +12 % que ayer». Una cifra sin referencia no dice si el negocio va
// bien o mal: $320.000 pueden ser un día excelente o un desastre, y lo decide
// el día anterior.
//
// ⚠️ **Si ayer no facturó, no hay porcentaje.** Dividir entre cero no da
// «infinito por ciento»: da `Infinity` o `NaN` en pantalla. En ese caso se dice
// que no hay datos de ayer y el importe del día se lee solo en la tarjeta.
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { formatMoney, formatPorcentaje } from '../../lib/format';

export function ComparacionAyer({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior <= 0) {
    return (
      <span className="badge badge-neutral">
        <Minus size={12} aria-hidden="true" />
        {actual > 0 ? 'Ayer no hubo ventas' : 'Sin datos de ayer'}
      </span>
    );
  }

  const diferencia = actual - anterior;
  const porcentaje = (diferencia / anterior) * 100;

  // El signo se pone a mano y el porcentaje se formatea **sin signo**: si no,
  // `formatPorcentaje` devolvería «−8%» y quedaría «+−8%».
  const signo = diferencia > 0 ? '+' : '−';
  const Icono = diferencia > 0 ? TrendingUp : diferencia < 0 ? TrendingDown : Minus;
  const tono = diferencia > 0 ? 'success' : diferencia < 0 ? 'danger' : 'neutral';

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`badge badge-${tono}`}>
        <Icono size={12} aria-hidden="true" />
        {diferencia === 0
          ? 'Igual que ayer'
          : `${signo}${formatPorcentaje(Math.abs(porcentaje), 1)} que ayer`}
      </span>
      {diferencia !== 0 && (
        <span className="tabular text-label font-normal text-text-muted">
          {formatMoney(Math.abs(diferencia))} {diferencia > 0 ? 'más' : 'menos'}
        </span>
      )}
    </span>
  );
}

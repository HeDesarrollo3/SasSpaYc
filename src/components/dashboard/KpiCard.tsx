// src/components/dashboard/KpiCard.tsx
//
// Tarjeta de métrica del panel.
//
// Existe para romper la monotonía del tablero anterior: **seis tarjetas
// idénticas** en las que «facturado hoy» pesaba lo mismo que «clientes
// registrados». La misma pieza sirve para las tres jerarquías (`heroe`,
// `normal`, `compacto`), así que el tamaño y la posición comunican qué importa
// sin duplicar markup.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export type TamanoKpi = 'heroe' | 'normal' | 'compacto';

/** Tamaño del número. El `heroe` es el dato protagonista del tablero. */
const VALOR: Record<TamanoKpi, string> = {
  heroe: 'text-display',
  normal: 'text-2xl',
  compacto: 'text-xl',
};

const RELLENO: Record<TamanoKpi, string> = {
  heroe: 'p-5',
  normal: 'p-5',
  compacto: 'p-4',
};

const CAJA_ICONO: Record<TamanoKpi, string> = {
  heroe: 'h-11 w-11',
  normal: 'h-10 w-10',
  compacto: 'h-9 w-9',
};

export interface KpiCardProps {
  etiqueta: string;
  valor: string;
  /** Texto de apoyo. Se admite un nodo para poder colar un enlace. */
  detalle: ReactNode;
  icono: LucideIcon;
  /** Clases de color del cuadro del icono (`bg-x/10 text-x`). */
  tono: string;
  cargando: boolean;
  /** Si se indica, la tarjeta **navega**. Sólo con destinos que existan. */
  to?: string;
  tamano?: TamanoKpi;
  /**
   * Resalta la tarjeta. Se usa en la única métrica que es una **cola de
   * trabajo**: cuando hay servicios sin cobrar, esa tarjeta tiene que ganarle
   * la mirada al resto del tablero.
   */
  resaltado?: boolean;
  /** Adorno bajo el número: comparaciones, badges de estado… */
  extra?: ReactNode;
  /**
   * Clases de la **celda** de rejilla (por ejemplo `lg:col-span-2`). Es lo que
   * permite que el dato protagonista ocupe más sitio que el resto sin duplicar
   * el componente.
   */
  className?: string;
}

export function KpiCard({
  etiqueta,
  valor,
  detalle,
  icono: Icono,
  tono,
  cargando,
  to,
  tamano = 'normal',
  resaltado = false,
  extra,
  className = '',
}: KpiCardProps) {
  const cuerpo = cargando ? (
    <div className="space-y-3" aria-hidden="true">
      <div className="skeleton h-3 w-1/2" />
      <div className={tamano === 'heroe' ? 'skeleton h-10 w-3/4' : 'skeleton h-7 w-3/4'} />
      <div className="skeleton h-3 w-2/3" />
    </div>
  ) : (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-label text-text-muted">{etiqueta}</p>
        <span
          className={`flex shrink-0 items-center justify-center rounded-sm ${CAJA_ICONO[tamano]} ${tono}`}
          aria-hidden="true"
        >
          <Icono size={tamano === 'heroe' ? 20 : 18} />
        </span>
      </div>

      <p className={`tabular mt-2 font-bold text-text-primary ${VALOR[tamano]}`}>{valor}</p>

      {extra && <div className="mt-2">{extra}</div>}

      {/* `mt-auto` ancla el pie abajo: en una fila de tarjetas de alturas
          distintas, los detalles quedan alineados entre sí. */}
      <div className="mt-auto pt-2 text-body-sm text-text-secondary">{detalle}</div>

      {to && (
        <span className="mt-2 inline-flex items-center gap-1 text-label font-semibold text-accent-from">
          Ir ahora
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      )}
    </>
  );

  // Sólo se marca `to` cuando existe una pantalla real de destino: inventar una
  // ruta que no existe llevaría a un 404 y a la sensación de que la app está rota.
  const clases = `panel flex h-full flex-col ${RELLENO[tamano]} ${
    resaltado ? 'border-warning/60' : ''
  } ${className}`;

  if (to && !cargando) {
    const textoDetalle = typeof detalle === 'string' ? `. ${detalle}` : '';
    return (
      <Link
        to={to}
        aria-label={`${etiqueta}: ${valor}${textoDetalle}`}
        className={`${clases} transition hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-from`}
      >
        {cuerpo}
      </Link>
    );
  }

  return <article className={clases}>{cuerpo}</article>;
}

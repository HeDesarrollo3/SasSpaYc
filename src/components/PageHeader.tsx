// src/components/PageHeader.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * Encabezado estándar de página.
 *
 * ## Por qué existe
 * El audit de consistencia encontró que **8 pantallas usaban `text-xl font-bold`
 * a mano** en lugar de la escala tipográfica (`text-h1`), que el ritmo vertical
 * variaba entre `space-y-4`, `space-y-5` y `space-y-6`, y que `POSPage` era la
 * única sin título. Nada de eso era un bug: era **deriva**, y la deriva no se
 * corrige pantalla a pantalla — se corrige con una pieza compartida que hace que
 * lo fácil sea lo consistente.
 *
 * ## Qué unifica
 * ```
 * ┌──────────────────────────────────────────────────────┐
 * │ [icono]  Título de la página        [acciones]       │
 * │          Descripción en una línea                    │
 * └──────────────────────────────────────────────────────┘
 * ```
 * · **Una sola escala tipográfica**: `text-h1` + `text-body-sm`.
 * · **Mismo ritmo**: `flex-col` en móvil, `sm:flex-row` con las acciones a la
 *   derecha a partir de `sm`. Nunca se amontonan.
 * · **Un solo sitio** donde cambiar el espaciado de las 16 pantallas.
 *
 * ## Uso
 * ```tsx
 * <PageHeader
 *   titulo="Bandeja de cobro"
 *   descripcion="Servicios ya realizados pendientes de confirmar el cobro."
 *   icono={ClipboardCheck}
 *   acciones={<button className="btn-primary">Actualizar</button>}
 * />
 * ```
 */
export interface PageHeaderProps {
  /** Título de la página. Es el `<h1>`: sólo debe haber uno por pantalla. */
  titulo: string;
  /** Línea de contexto bajo el título. Acepta nodos por si lleva un enlace. */
  descripcion?: React.ReactNode;
  /** Icono decorativo delante del título. Se oculta a lectores de pantalla. */
  icono?: React.ComponentType<{ size?: number | string; className?: string }>;
  /** Botones o controles alineados a la derecha. */
  acciones?: React.ReactNode;
  /**
   * Ruta a la que volver. Muestra una flecha a la izquierda.
   * Pensado para el portal móvil (`/app/nuevo` → `/app`).
   */
  volver?: string;
  /** Texto accesible del enlace de volver. */
  volverEtiqueta?: string;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
  volver,
  volverEtiqueta = 'Volver',
  className = '',
}) => (
  <header
    className={`flex flex-col justify-between gap-3 sm:flex-row sm:items-center ${className}`}
  >
    <div className="flex min-w-0 items-start gap-3">
      {volver && (
        <Link
          to={volver}
          aria-label={volverEtiqueta}
          className="btn-icon mt-0.5 shrink-0"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </Link>
      )}
      {Icono && (
        <span className="mt-0.5 shrink-0 text-accent-from">
          <Icono size={24} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-h1 text-text-primary">{titulo}</h1>
        {descripcion && (
          <p className="mt-1 text-body-sm text-text-secondary">{descripcion}</p>
        )}
      </div>
    </div>
    {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
  </header>
);

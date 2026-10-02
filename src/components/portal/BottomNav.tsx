// src/components/portal/BottomNav.tsx
import { NavLink } from 'react-router-dom';
import {
  ClipboardList,
  House,
  Target,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Bottom-nav del portal: 5 destinos, uno por pantalla (spec §2.2).
 *
 * Reglas que cumple:
 * - **Área táctil mínima de 48px de alto** en cada ítem (`min-h-12`): es la guía
 *   de accesibilidad para iOS/Android y el motivo por el que el nav no se comprime.
 *   Con 5 ítems cada uno sigue midiendo más de 48px de ancho: el mínimo son 240px
 *   y cualquier móvil pasa de 360.
 * - **Safe area**: `pb-[env(safe-area-inset-bottom)]` deja hueco para la barra
 *   gestual del iPhone; sin él, el último ítem queda bajo la barra del sistema.
 * - **Oculto en escritorio** (`lg:hidden`): si el colaborador entra desde un PC, el
 *   contenido se centra a `max-w-md` y el nav desaparece en vez de estirarse.
 * - Cada destino lleva **ícono + texto** y `aria-current` lo pone `NavLink`, para
 *   que un lector de pantalla anuncie en qué sección está.
 *
 * `Metas` se añadió al existir `/app/metas`: sin entrada en el nav, la pantalla
 * sólo era alcanzable desde el enlace de la tarjeta hero, y definir la meta es
 * justo lo que hace que la hero sirva de algo.
 */
type Destino = { to: string; etiqueta: string; Icono: LucideIcon; end?: boolean };

const DESTINOS: Destino[] = [
  { to: '/app', etiqueta: 'Inicio', Icono: House, end: true },
  { to: '/app/servicios', etiqueta: 'Mis servicios', Icono: ClipboardList },
  { to: '/app/comisiones', etiqueta: 'Comisiones', Icono: Wallet },
  { to: '/app/metas', etiqueta: 'Metas', Icono: Target },
  { to: '/app/perfil', etiqueta: 'Perfil', Icono: UserRound },
];

export function BottomNav() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-bg-elevated/95 backdrop-blur-md lg:hidden">
      <nav aria-label="Navegación principal" className="pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-md items-stretch">
          {DESTINOS.map(({ to, etiqueta, Icono, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition-colors ${
                    isActive ? 'text-accent-from' : 'text-text-muted hover:text-text-secondary'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icono
                      size={20}
                      aria-hidden="true"
                      className={isActive ? 'text-accent-from' : undefined}
                    />
                    <span>{etiqueta}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

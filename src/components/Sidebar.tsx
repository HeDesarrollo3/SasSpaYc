// src/components/Sidebar.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  UserCog,
  CreditCard,
  Receipt,
  ShieldCheck,
  Settings,
  ClipboardCheck,
  Sparkles,
  X,
  Landmark,
  BarChart3,
  Contact,
  Gift,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import type { Rol } from '../types/auth.types';

// -----------------------------------------------------------------------------
// Definición del menú (con roles permitidos)
// -----------------------------------------------------------------------------
type MenuItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Si se omite, el ítem es visible para todos los roles. */
  roles?: Rol[];
};

const MENU_ITEMS: MenuItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },

  // Lo primero que debe ver caja y recepción al entrar: los servicios que los
  // colaboradores han registrado y todavía no se han cobrado.
  {
    label: 'Bandeja de cobro',
    path: '/cobros',
    icon: ClipboardCheck,
    roles: ['administrador', 'recepcionista', 'cajero'],
  },
  { label: 'Terminal POS', path: '/pos', icon: ShoppingCart },

  // Admin + cajero
  {
    label: 'Control Caja',
    path: '/caja',
    icon: DollarSign,
    roles: ['administrador', 'cajero'],
  },
  {
    label: 'Clientes',
    path: '/clientes',
    icon: Contact,
    roles: ['administrador', 'recepcionista', 'cajero'],
  },
  {
    label: 'Cuentas / Créditos',
    path: '/cuentas',
    icon: CreditCard,
    roles: ['administrador', 'cajero'],
  },

  // Solo admin
  {
    label: 'Reportes',
    path: '/reportes',
    icon: BarChart3,
    roles: ['administrador'],
  },
  {
    label: 'Combos y promos',
    path: '/combos',
    icon: Gift,
    roles: ['administrador'],
  },
  {
    label: 'Bancos y efectivo',
    path: '/finanzas',
    icon: Landmark,
    roles: ['administrador'],
  },
  {
    label: 'Inventario',
    path: '/inventory',
    icon: Package,
    roles: ['administrador'],
  },
  {
    label: 'Colaboradores',
    path: '/colaboradores',
    icon: Users,
    roles: ['administrador'],
  },
  {
    label: 'Liquidaciones',
    path: '/liquidaciones',
    icon: Receipt,
    roles: ['administrador'],
  },
  {
    label: 'Usuarios',
    path: '/usuarios',
    icon: UserCog,
    roles: ['administrador'],
  },
  {
    label: 'Auditoría',
    path: '/auditoria',
    icon: ShieldCheck,
    roles: ['administrador'],
  },
  {
    label: 'Configuración',
    path: '/settings',
    icon: Settings,
    roles: ['administrador'],
  },
];

// -----------------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------------
export const Sidebar: React.FC<{
  /** Sólo cuenta por debajo de `lg`: en escritorio el menú siempre se ve. */
  abierto: boolean;
  onCerrar: () => void;
  nombreNegocio: string;
}> = ({ abierto, onCerrar, nombreNegocio }) => {
  const user = useAuthStore((s) => s.user);
  const hasRole = useAuthStore((s) => s.hasRole);

  const visibleItems = MENU_ITEMS.filter((item) => !item.roles || hasRole(...item.roles));

  return (
    <>
      {/* Fondo oscuro detrás del menú en celular/tablet; un toque fuera lo cierra. */}
      <div
        className={[
          'fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden',
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={onCerrar}
        aria-hidden="true"
      />
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col justify-between overflow-y-auto',
          'border-r border-border-subtle bg-bg-elevated transition-transform duration-200',
          abierto ? 'translate-x-0' : '-translate-x-full',
          'lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:translate-x-0',
        ].join(' ')}
        aria-label="Navegación principal"
      >
        {/* Marca */}
        <div className="p-4">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-accent-from/20 rounded-md text-accent-from">
              <Sparkles size={22} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-text-primary truncate">{nombreNegocio}</h2>
              <span className="text-xs text-text-muted block">Administración</span>
            </div>
            <button
              type="button"
              onClick={onCerrar}
              className="btn-icon lg:hidden"
              aria-label="Cerrar menú"
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav */}
          <nav className="mt-6 space-y-1" aria-label="Menú principal">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    [
                      'flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-md text-sm lg:min-h-0 lg:text-xs font-medium',
                      'transition-colors duration-200',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-from',
                      isActive
                        ? 'bg-accent-soft text-accent-from font-semibold'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-card',
                    ].join(' ')
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer: perfil del usuario */}
        {user && (
          <div className="p-4 border-t border-border-subtle">
            <div className="flex items-center gap-3 px-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-from to-accent-to flex items-center justify-center text-on-accent text-xs font-bold shrink-0">
                {user.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text-primary truncate">{user.nombre}</p>
                <p className="text-xs text-text-muted capitalize truncate">{user.rol}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

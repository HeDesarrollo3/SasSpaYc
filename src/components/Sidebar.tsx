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
  ShieldCheck,
  Settings,
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
  { label: 'Terminal POS', path: '/pos', icon: ShoppingCart },

  // Admin + cajero
  {
    label: 'Control Caja',
    path: '/caja',
    icon: DollarSign,
    roles: ['administrador', 'cajero'],
  },
  {
    label: 'Cuentas / Créditos',
    path: '/cuentas',
    icon: CreditCard,
    roles: ['administrador', 'cajero'],
  },

  // Solo admin
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
export const Sidebar: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const hasRole = useAuthStore((s) => s.hasRole);

  const visibleItems = MENU_ITEMS.filter(
    (item) => !item.roles || hasRole(...item.roles),
  );

  return (
    <aside
      className="w-64 bg-bg-elevated border-r border-border-subtle flex flex-col justify-between h-screen sticky top-0"
      aria-label="Navegación principal"
    >
      {/* Brand */}
      <div className="p-4">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-accent-from/20 rounded-md text-accent-from">
            <ShoppingCart size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text-primary truncate">
              MiTienda POS
            </h2>
            <span className="text-[10px] text-text-muted block">
              SaaS Multitenant
            </span>
          </div>
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
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium',
                    'transition-colors duration-200',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-from',
                    isActive
                      ? 'bg-accent-from text-white shadow-lg shadow-accent-from/20 font-bold'
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
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-from to-accent-to flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-text-primary truncate">
                {user.nombre}
              </p>
              <p className="text-[10px] text-text-muted capitalize truncate">
                {user.rol}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
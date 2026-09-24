import React from 'react';
import { AuthService } from '../services/auth.service';
import { LogOut, User, Bell } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';

export const Header: React.FC = () => {
// const user = AuthService.getUser();
const user = useAuthStore((s) => s.user);
const hasRole = useAuthStore((s) => s.hasRole);

  return (
    <header className="h-16 border-b border-border-subtle bg-bg-elevated/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <span className="text-xs px-2.5 py-1 rounded-full bg-accent-from/10 border border-accent-from/30 text-accent-from font-semibold">
          Tenant POS Live
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button 
          aria-label="Notificaciones" 
          className="p-2 text-text-secondary hover:text-text-primary rounded-sm transition-colors"
        >
          <Bell size={18} />
        </button>

        <div className="h-4 w-[1px] bg-border-subtle" />

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-card border border-border-strong flex items-center justify-center text-text-primary font-bold text-xs">
            {user?.nombre ? user.nombre.substring(0, 2).toUpperCase() : 'US'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-text-primary leading-tight">{user?.nombre || 'Usuario'}</p>
            <p className="text-[10px] text-text-muted capitalize">{user?.rol || 'Administrador'}</p>
          </div>
        </div>

        <button
          onClick={() => AuthService.logout()}
          title="Cerrar Sesión"
          className="p-2 text-text-muted hover:text-danger rounded-sm transition-colors ml-2"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};
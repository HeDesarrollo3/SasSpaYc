import React from 'react';
import { AuthService } from '../services/auth.service';
import { LogOut, Menu } from 'lucide-react';
import { BotonSonido } from './BotonSonido';
import { BotonTema } from './BotonTema';
import { AsistenteVoz } from './AsistenteVoz';
import { useAuthStore } from '../stores/auth.store';
import { ROL, claseBadge, metaEstado } from '../lib/estados';
import { iniciales } from '../lib/format';

export const Header: React.FC<{ onAbrirMenu: () => void; nombreNegocio: string }> = ({
  onAbrirMenu,
  nombreNegocio,
}) => {
  const user = useAuthStore((s) => s.user);
  // La etiqueta del rol sale de `lib/estados`: una sola fuente de verdad.
  const rol = metaEstado(ROL, user?.rol);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border-subtle bg-bg-elevated/80 px-3 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onAbrirMenu}
          className="btn-icon lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>
        <span className="truncate text-sm font-semibold text-text-primary lg:hidden">
          {nombreNegocio}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {/*
          Este botón era una campana de «Notificaciones» que **no hacía nada**:
          no tenía `onClick` ni estado. Ahora es el interruptor real de los avisos
          sonoros, que sí funcionan. Un botón muerto en la cabecera es peor que no
          tenerlo: el usuario lo pulsa, no pasa nada y deja de confiar en el resto.
        */}
        <AsistenteVoz />
        <BotonTema />
        <BotonSonido />

        <div className="hidden h-4 w-[1px] bg-border-subtle sm:block" />

        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong bg-surface-card text-xs font-bold text-text-primary"
          >
            {iniciales(user?.nombre)}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-semibold leading-tight text-text-primary">
              {user?.nombre || 'Usuario'}
            </p>
            <span className={claseBadge(rol.tono)}>{rol.label}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => AuthService.logout()}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="btn-icon group sm:ml-2"
        >
          {/* El color va en el ícono: `.btn-icon:hover` es CSS sin capa y gana a
              cualquier utilidad de Tailwind (`@layer utilities`). */}
          <LogOut size={18} className="group-hover:text-danger" />
        </button>
      </div>
    </header>
  );
};

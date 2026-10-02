// src/components/BotonTema.tsx
import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { aplicarTema, temaGuardado, type Tema } from '../lib/tema';

/** Interruptor modo claro / modo oscuro. Se recuerda en este dispositivo. */
export const BotonTema: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [tema, setTema] = useState<Tema>(temaGuardado);
  const siguiente: Tema = tema === 'oscuro' ? 'claro' : 'oscuro';

  return (
    <button
      type="button"
      onClick={() => {
        aplicarTema(siguiente);
        setTema(siguiente);
      }}
      className={`btn-icon ${className}`}
      aria-label={siguiente === 'oscuro' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      title={siguiente === 'oscuro' ? 'Modo oscuro' : 'Modo claro'}
    >
      {tema === 'oscuro' ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
    </button>
  );
};

// src/components/BotonSonido.tsx
import React from 'react';
import { BellRing, VolumeX } from 'lucide-react';
import { usePreferenciaSonido } from '../hooks/useNotificacionSonora';

/**
 * Interruptor de avisos sonoros.
 *
 * Va en la cabecera (escritorio) y en el portal móvil. Muestra siempre **icono +
 * texto accesible** y nunca depende sólo del color para comunicar el estado.
 *
 * Si el navegador no puede sintetizar audio, **no se renderiza**: un interruptor
 * que no hace nada es peor que no tenerlo.
 */
export const BotonSonido: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { activo, disponible, alternar } = usePreferenciaSonido();

  if (!disponible) return null;

  return (
    <button
      type="button"
      onClick={() => void alternar()}
      className={`btn-icon ${activo ? '' : 'opacity-60'} ${className}`}
      aria-pressed={activo}
      aria-label={activo ? 'Silenciar los avisos de sonido' : 'Activar los avisos de sonido'}
      title={
        activo
          ? 'Avisos sonoros activados: suenan al registrarse un servicio y al cobrarse'
          : 'Avisos sonoros silenciados'
      }
    >
      {activo ? <BellRing size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
    </button>
  );
};

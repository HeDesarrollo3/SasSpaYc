import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Headers';
import { AvisoSonoro } from './AvisoSonoro';
import { useFormato } from '../hooks/useFormato';

export const MainLayout: React.FC = () => {
  // Aplica la configuración de formato del negocio (moneda y zona horaria) al
  // formateo global en cuanto arranca el panel. Los valores por defecto de
  // `lib/format.ts` ya son los del negocio, así que esto sólo confirma o corrige
  // y no hay parpadeo de importes.
  const { formato } = useFormato();

  // Menú lateral en celular y tablet: oculto por defecto, se abre con el botón
  // de la cabecera y se cierra al navegar o con Escape. En escritorio (lg) está fijo.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuAbierto(false), [pathname]);
  useEffect(() => {
    if (!menuAbierto) return;
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAbierto(false);
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [menuAbierto]);

  const nombreNegocio = formato?.negocio?.nombre?.trim() || 'Mi spa';
  useEffect(() => {
    if (!formato?.negocio?.nombre) return;
    document.title = nombreNegocio;
    try {
      localStorage.setItem('negocio_nombre', nombreNegocio);
    } catch {
      /* sin almacenamiento: el login mostrará «Tu spa» */
    }
  }, [formato?.negocio?.nombre, nombreNegocio]);

  return (
    <div className="flex min-h-screen bg-bg-base text-text-primary">
      {/*
        Aviso sonoro GLOBAL, montado en el layout y no en una página: el cajero
        tiene que oír que entra un servicio esté en la pantalla que esté. Si
        viviera en `/cobros` sólo sonaría con esa pantalla abierta — y
        precisamente no la tiene abierta, está atendiendo el mostrador.
      */}
      <AvisoSonoro />
      <Sidebar
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
        nombreNegocio={nombreNegocio}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onAbrirMenu={() => setMenuAbierto(true)} nombreNegocio={nombreNegocio} />
        <main className="flex-1 overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

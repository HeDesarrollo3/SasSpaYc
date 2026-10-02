// src/components/portal/AppLayout.tsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { PortalHeader } from './PortalHeader';
import { AvisoSonoro } from '../AvisoSonoro';
import { useAuthStore } from '../../stores/auth.store';
import { useFormato } from '../../hooks/useFormato';
import { useComandasDeLaSemana } from '../../hooks/useComandas';

/**
 * Shell móvil del portal del colaborador (`/app`).
 *
 * Va **fuera** del `MainLayout` de escritorio: el colaborador usa el celular, de
 * pie y con una mano, así que no lleva sidebar ni tabla densa. Estructura:
 *
 * ```
 * ┌──────────────────────────────┐
 * │ PortalHeader (saludo + $)    │  sticky
 * ├──────────────────────────────┤
 * │ <Outlet/>  max-w-md centrado │  scroll
 * ├──────────────────────────────┤
 * │ BottomNav (4 ítems, 48px)    │  sticky abajo, oculto en `lg`
 * └──────────────────────────────┘
 * ```
 *
 * Decisiones móviles (spec §8):
 * - `min-h-[100dvh]`, **nunca** `100vh`: la barra de Safari rompe `vh` y el nav
 *   acabaría fuera de pantalla.
 * - El `main` reserva hueco inferior (`pb-28` + `env(safe-area-inset-bottom)` en
 *   el propio nav) para que el nav fijo no tape la última tarjeta.
 * - En `lg` el nav se oculta (`lg:hidden`) y el contenido queda centrado a
 *   `max-w-md`: en un PC se ve como una columna estrecha, que es lo legible aquí.
 *
 * ⚠️ **El importe del header no se puede calcular aquí.** El listado
 * `GET /comandas` devuelve la cabecera **sin líneas** (el backend hace
 * `select('*')` sobre `comandas`, sin unir `comanda_items`), y la comisión vive en
 * las líneas. Para no disparar una petición de detalle por cada comanda sólo por
 * un número decorativo, el header muestra «—» y quien tiene la cifra real es
 * `/app/comisiones`, que sí pide los detalles que necesita.
 */
export const AppLayout: React.FC = () => {
  const user = useAuthStore((s) => s.user);

  // El portal también formatea dinero (`PortalHeader`, comisiones), así que
  // aplica la moneda del negocio igual que el panel de escritorio.
  useFormato();

  // ⚠️ **Esto estaba hardcodeado a `null`**, así que «Comisiones de la semana»
  // decía «Sin datos todavía» **siempre**, aunque la colaboradora tuviera dinero
  // cobrado. El comentario que lo justificaba decía que el listado `GET /comandas`
  // no traía la comisión y que pedir el detalle de cada comanda sería un N+1 por
  // un número decorativo.
  //
  // **Esa razón caducó**: el listado ya devuelve `comision_total` por comanda, así
  // que el dato se obtiene con **una sola petición** y sin N+1. Es un recordatorio
  // de que un comentario que explica una limitación **hay que revisarlo cuando la
  // limitación desaparece** — si no, la limitación se queda para siempre y encima
  // documentada.
  const semana = useComandasDeLaSemana();

  // Sólo las `confirmada` cuentan: la comisión se genera al cobrar el total.
  const comisionesSemana = semana.data
    ? (semana.data.data ?? [])
        .filter((c) => c.estado === 'confirmada')
        .reduce((total, c) => total + Number((c as { comision_total?: number }).comision_total ?? 0), 0)
    : null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg-base text-text-primary">
      {/*
        Aviso sonoro del colaborador: suena cuando le **confirman el cobro** de un
        servicio. Es el aviso que sostiene el hábito — si registra y nunca sabe si
        le pagaron, deja de registrar. Ojo: es un sonido DISTINTO al de recepción
        (una nota brillante y suave, no dos ascendentes), porque significan cosas
        distintas.
      */}
      <AvisoSonoro />
      <PortalHeader
        nombre={user?.nombre ?? ''}
        comisionesSemana={comisionesSemana}
        cargando={semana.isPending}
      />

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4 lg:pb-10">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
};

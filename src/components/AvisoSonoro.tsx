// src/components/AvisoSonoro.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiSuccess, type Paginated } from '../services/api';
import { useNotificacionSonora } from '../hooks/useNotificacionSonora';
import { comandasKeys } from '../services/comandas.service';
import { useAuthStore } from '../stores/auth.store';

/**
 * Aviso sonoro **global**: suena desde cualquier pantalla, no sólo en la bandeja.
 *
 * ## Por qué global y no dentro de una página
 * Si el aviso viviera en `/cobros`, el cajero sólo lo oiría con esa pantalla
 * abierta — y precisamente no la tiene abierta: está atendiendo el mostrador. El
 * aviso tiene que llegar **esté donde esté**.
 *
 * ## Los dos avisos, y por qué son distintos
 *
 * | Quién | Señal | Por qué |
 * |---|---|---|
 * | `cajero` y `recepcionista` | Aparece una comanda `pendiente` | Hay dinero esperando en el salón: es una **cola de trabajo** |
 * | `colaborador` | Aumenta su número de comandas `confirmada` | Le acaban de **confirmar el cobro**: es su comisión |
 *
 * ## Detalles que evitan que sea insoportable
 * - **`refetchInterval` de 30 s**, igual que la bandeja, para no castigar la API.
 * - El hook `useNotificacionSonora` **sólo suena cuando el número SUBE**. Si hay 3
 *   pendientes y siguen siendo 3, no suena: eso ya lo sabías.
 * - **En la primera carga no suena.** Entrar a la app con 3 pendientes no es una
 *   novedad; lo sería pasar a 4.
 * - `enabled` por rol: el `administrador` **también** oye el de pendientes (es
 *   quien supervisa), pero no se le pide nada más.
 *
 * No renderiza nada: es un componente sin interfaz.
 */
export const AvisoSonoro: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const rol = user?.rol;

  const esColaborador = rol === 'colaborador';
  const oyeServiciosNuevos =
    rol === 'cajero' || rol === 'recepcionista' || rol === 'administrador';

  // ── Aviso de SERVICIO NUEVO (caja y recepción) ────────────────────────────
  // Endpoint ligero: devuelve un solo número, no una lista.
  const pendientes = useQuery({
    queryKey: comandasKeys.conteoPendientes(),
    queryFn: async () => {
      const res = await api.get<unknown, ApiSuccess<{ pendientes: number }>>(
        '/comandas/pendientes/count',
      );
      return res.data?.pendientes ?? 0;
    },
    enabled: oyeServiciosNuevos,
    refetchInterval: 30_000,
    // Sin esto, cada vuelta a la pestaña dispararía una consulta y podría
    // parecer un aumento cuando sólo es un refresco.
    refetchOnWindowFocus: false,
  });

  useNotificacionSonora(
    oyeServiciosNuevos ? pendientes.data : undefined,
    'nuevo_servicio',
    oyeServiciosNuevos,
  );

  // ── Aviso de COBRO CONFIRMADO (colaborador) ───────────────────────────────
  // `limit=1` a propósito: sólo se necesita `meta.total`, el recuento. Traer las
  // filas sería desperdiciar ancho de banda cada 30 segundos.
  const confirmadas = useQuery({
    queryKey: ['comandas', 'confirmadas', 'conteo'],
    queryFn: async () => {
      const res = await api.get<unknown, Paginated<{ id: number }>>(
        '/comandas?estado=confirmada&limit=1',
      );
      return res.meta?.total ?? 0;
    },
    enabled: esColaborador,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  useNotificacionSonora(
    esColaborador ? confirmadas.data : undefined,
    'cobrado',
    esColaborador,
  );

  return null;
};

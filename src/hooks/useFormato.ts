// src/hooks/useFormato.ts
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ParametrosService,
  aplicarFormato,
  type FormatoApi,
} from '../services/parametros.service';

export const FORMATO_KEY = ['parametros', 'formato'] as const;

/**
 * Carga la configuración de formato del negocio y la aplica al formateo global.
 *
 * ## Por qué no bloquea el renderizado
 * Los valores por defecto de `lib/format.ts` ya son los del negocio
 * (peso colombiano), así que **el primer render ya es correcto**: esta consulta
 * sólo confirma o corrige. Por eso no hay pantalla de carga ni parpadeo de
 * importes en la moneda equivocada — que es justo lo que pasaría si los valores
 * por defecto fueran otros.
 *
 * Se monta en los dos layouts (`MainLayout` y `AppLayout`) para cubrir tanto el
 * panel de escritorio como el portal del colaborador.
 */
export function useFormato() {
  const query = useQuery({
    queryKey: FORMATO_KEY,
    queryFn: () => ParametrosService.obtenerFormato(),
    // Cambia muy rara vez: no tiene sentido re-consultarlo al navegar.
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // Si falla, la app sigue funcionando con los valores por defecto.
    retry: 1,
  });

  useEffect(() => {
    if (query.data) aplicarFormato(query.data);
  }, [query.data]);

  return { formato: query.data as FormatoApi | undefined, cargando: query.isLoading };
}

/**
 * Refresca la configuración **y todo lo que depende de ella**.
 *
 * `formatMoney` no es reactivo: si sólo se recargara el formato, los componentes
 * ya montados seguirían mostrando los importes con el formato anterior hasta que
 * algo los hiciera re-renderizar. Invalidar toda la caché fuerza ese
 * re-renderizado, porque cada pantalla vuelve a pintar sus datos.
 *
 * Se usa tras cambiar la moneda en Ajustes.
 */
export function useRefrescarFormato() {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: FORMATO_KEY });
    await qc.invalidateQueries();
  };
}

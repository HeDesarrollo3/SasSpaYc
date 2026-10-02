// src/hooks/useNotificacionSonora.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activarSonidos,
  prepararSonidosConPrimerGesto,
  reproducirSonido,
  setSonidosActivos,
  sonidosActivos,
  sonidosDisponibles,
  type TipoSonido,
} from '../lib/sonidos';

/**
 * Reproduce un aviso sonoro **cuando un valor AUMENTA**.
 *
 * ## El problema que resuelve
 * Las pantallas de este sistema se refrescan solas (`refetchInterval` de 30 s en
 * la bandeja de cobro, 30 s en el panel). Si el sonido se disparara con cada
 * consulta, **sonaría cada 30 segundos para siempre** mientras hubiera algo
 * pendiente: el usuario lo desactivaría en cinco minutos y la función quedaría
 * muerta.
 *
 * Este hook guarda el valor anterior y **sólo suena si el nuevo es mayor**. Es
 * decir: suena cuando **aparece** un servicio, no mientras haya servicios.
 *
 * ## Detalles que importan
 * - **En la primera carga no suena.** Si entras a la bandeja y ya hay 3
 *   pendientes, eso no es una novedad: es el estado actual. Sólo suena en el
 *   salto `3 → 4`.
 * - **Si el valor baja, no suena** (alguien cobró): se actualiza la referencia
 *   sin hacer ruido.
 * - **Si el valor llega `undefined`** (mientras carga) no toca nada, para no
 *   confundir «cargando» con «cero» y disparar un falso aviso al llegar los datos.
 *
 * @param valor  Métrica a vigilar (normalmente un contador de pendientes).
 * @param tipo   Qué aviso suena.
 * @param enabled Permite desactivarlo por rol o por pantalla.
 */
export function useNotificacionSonora(
  valor: number | undefined,
  tipo: TipoSonido,
  enabled = true,
): void {
  const anterior = useRef<number | null>(null);

  // El contexto de audio necesita un gesto del usuario para arrancar.
  useEffect(() => {
    prepararSonidosConPrimerGesto();
  }, []);

  useEffect(() => {
    if (!enabled || valor === undefined) return;

    const previo = anterior.current;
    anterior.current = valor;

    // Primera lectura: se memoriza sin sonar.
    if (previo === null) return;

    if (valor > previo) {
      reproducirSonido(tipo);
    }
  }, [valor, tipo, enabled]);
}

/**
 * Preferencia de sonido **por dispositivo**, con estado de React.
 *
 * Vive en `localStorage` y no en el servidor a propósito: es una preferencia de
 * quién está delante de esa pantalla. Que el dueño active los sonidos en su PC
 * no debe activárselos al cajero del mostrador.
 */
export function usePreferenciaSonido() {
  const [activo, setActivo] = useState<boolean>(() => sonidosActivos());
  const [disponible] = useState<boolean>(() => sonidosDisponibles());

  const alternar = useCallback(async () => {
    const siguiente = !activo;
    setSonidosActivos(siguiente);
    setActivo(siguiente);
    // Activar el sonido **es** un gesto del usuario: aprovechamos para
    // desbloquear el audio en el mismo clic. Sin esto, activar el interruptor no
    // bastaría y el primer aviso se perdería.
    if (siguiente) await activarSonidos();
  }, [activo]);

  return { activo, disponible, alternar };
}

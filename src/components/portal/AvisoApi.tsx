// src/components/portal/AvisoApi.tsx
import { CircleAlert, Info, TriangleAlert, WifiOff, X } from 'lucide-react';
import {
  codigoApi,
  esErrorMigraciones,
  mensajeApi,
} from '../../services/comandas.service';
import { claseBanner } from '../../lib/estados';

/**
 * Aviso de error de la API para el portal del colaborador.
 *
 * Tres niveles, de menos a más alarmante:
 *
 * 1. **Informativo (azul)** — el error es el aviso de *migraciones pendientes* del
 *    backend. No es culpa de nadie y no se arregla reintentando: hay que aplicarlas
 *    en Supabase. Se muestra el texto literal del backend para que quien lea la
 *    pantalla pueda buscarlo.
 * 2. **Aviso (ámbar)** — errores de uso esperables (`FORBIDDEN`, `INVALID_STATE`,
 *    `COMANDAS_NO_EDITABLE`, `SIN_COLABORADOR_VINCULADO`) o falta de conexión.
 * 3. **Error (rojo)** — el resto.
 *
 * Nunca se usa `alert()` ni se deja la pantalla en blanco.
 */
export function AvisoApi({
  error,
  onDescartar,
  className,
}: {
  error: unknown;
  onDescartar?: () => void;
  className?: string;
}) {
  if (!error) return null;

  const codigo = codigoApi(error);
  const mensaje = mensajeApi(error);
  const migraciones = esErrorMigraciones(error);
  const sinRed = codigo === 'NETWORK_ERROR';

  const tono = migraciones ? 'info' : sinRed || codigo === 'FORBIDDEN' || codigo === 'INVALID_STATE'
    ? 'warning'
    : 'danger';

  const Icono = migraciones ? Info : sinRed ? WifiOff : tono === 'warning' ? TriangleAlert : CircleAlert;

  return (
    <div className={`${claseBanner(tono)} ${className ?? ''}`} role="status" aria-live="polite">
      <Icono size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        {migraciones ? (
          <>
            {/*
              ⚠️ Aquí decía: «La base de datos todavía no tiene las tablas de
              servicios... falta aplicar las migraciones 005 y 006».

              Eso es un **diagnóstico técnico** puesto delante de una colaboradora
              que está de pie con el móvil: le habla de tablas, de la base de datos
              y de números de migración, y **no puede hacer nada con esa
              información**. Lo único accionable era la última frase, así que se
              conserva esa y se quita el resto.
            */}
            <p className="font-semibold">Esta función aún no está disponible</p>
            <p className="mt-1">
              No es un fallo tuyo ni de la aplicación: falta activarla. Avisa a
              administración y podrás usarla.
            </p>
            <p className="mt-1 text-body-sm opacity-80">{mensaje}</p>
          </>
        ) : sinRed ? (
          <>
            <p className="font-semibold">Sin conexión con el servidor</p>
            <p className="mt-1">
              Comprueba la señal y vuelve a intentarlo. Lo que ya estaba en pantalla se
              conserva.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">{mensaje}</p>
            <p className="mt-0.5 text-[11px] opacity-80">Código: {codigo}</p>
          </>
        )}
      </div>
      {onDescartar && (
        <button
          type="button"
          className="btn-icon"
          onClick={onDescartar}
          aria-label="Descartar aviso"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

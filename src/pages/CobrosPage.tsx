// src/pages/CobrosPage.tsx
//
// `/cobros` — **la bandeja de cobro**: la pantalla que faltaba entre el portal
// del colaborador y el POS.
//
// El colaborador registra un servicio y la comanda queda en `pendiente`. Hasta
// ahora no había ninguna pantalla para cobrarla: `POSPage` se escribió antes que
// el módulo de comandas y nunca se conectó al endpoint de confirmación. Aquí está
// el eslabón: se ve la cola ordenada por antigüedad (lo que más lleva esperando
// primero) y se cobra en dos toques.
//
// Dinero y fechas: `totalComanda()` (confirmado si existe, si no el estimado) y
// `formatRelativo()` — el tiempo de espera es el dato que presiona para cobrar.
// Nada de `toFixed` ni de `toLocaleString`.
//
// ⚠️ **Contrato del listado (verificado contra el backend):** `GET
// /comandas/pendientes` devuelve `Paginated<Comanda>` — con el interceptor de
// `services/api.ts`, `res.data` es **el array** y `meta` va al lado — y cada fila
// trae ya `items` (con `servicio_nombre`) más un `comision_total`. El controller
// **no lee query params**: siempre son las 100 más antiguas en `pendiente`.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CircleAlert,
  ClipboardCheck,
  Clock,
  HandCoins,
  Info,
  ListChecks,
  RefreshCw,
} from 'lucide-react';

import {
  ComandasService,
  comandasKeys,
  esErrorMigraciones,
  totalComanda,
} from '../services/comandas.service';
import { ColaboradoresService } from '../services/colaboradores.service';
import { ComandaPendienteCard, type ComandaBandeja } from '../components/cobros/ComandaPendienteCard';
import { CobroDrawer } from '../components/cobros/CobroDrawer';
import { PageHeader } from '../components/PageHeader';
import { formatMoney, formatNumero, formatRelativo } from '../lib/format';
import { claseBanner } from '../lib/estados';

/** Es una cola de trabajo: interesa que esté viva sin tocar nada. */
const REFRESCO_MS = 30_000;

/** Clave compartida con `LiquidacionesPage` para el selector de cuenta. */
const KEY_COLABORADORES = 'colaboradores';

export const CobrosPage: React.FC = () => {
  const [comandaAbierta, setComandaAbierta] = useState<ComandaBandeja | null>(null);

  /**
   * La bandeja: `/comandas/pendientes` (atajo de `estado=pendiente` ordenado por
   * `fecha_servicio` ascendente = **la más vieja primero**).
   */
  const pendientes = useQuery({
    queryKey: comandasKeys.pendientes(),
    queryFn: () => ComandasService.listarPendientes(100),
    refetchInterval: REFRESCO_MS,
  });

  /**
   * Contador autoritativo de pendientes (`/comandas/pendientes/count`).
   *
   * Se consulta con `useQuery` y la **misma clave** que `usePendientesCount()`
   * (el hook del portal) para compartir caché con el badge del sidebar; el hook
   * no expone `refetchInterval` y aquí la cifra tiene que refrescarse sola, como
   * la lista. El payload NO es paginado: `contarPendientes()` devuelve el objeto
   * `{ pendientes }`, no un sobre con `data`.
   */
  const conteo = useQuery({
    queryKey: comandasKeys.conteoPendientes(),
    queryFn: ComandasService.contarPendientes,
    refetchInterval: REFRESCO_MS,
  });

  /**
   * Nombres de colaborador para las filas: la comanda sólo trae
   * `colaborador_id`. El endpoint está permitido para administración, recepción
   * y caja (los mismos roles de esta pantalla) y se cachea 5 minutos.
   */
  const colaboradores = useQuery({
    queryKey: [KEY_COLABORADORES, 'opciones-cobros'],
    queryFn: () => ColaboradoresService.listar({ activo: true, limit: 100 }),
    staleTime: 5 * 60_000,
  });

  const filas = (pendientes.data?.data ?? []) as ComandaBandeja[];
  const meta = pendientes.data?.meta;

  const nombresColaboradores = new Map<number, string>(
    (colaboradores.data?.data ?? []).map((c) => [c.id, c.nombre]),
  );

  /** «Dinero sin entrar»: lo que suman los pendientes que hay en pantalla. */
  const totalPendiente = filas.reduce((acc, c) => acc + totalComanda(c), 0);
  const numPendientes = conteo.data?.pendientes ?? meta?.total ?? filas.length;
  const masAntigua = filas[0]?.fecha_servicio;
  const cargando = pendientes.isLoading;
  const error = pendientes.error;
  const migraciones = esErrorMigraciones(error);
  const hayMasDeLasQueSeVen = (meta?.total ?? 0) > filas.length;

  const refrescar = () => {
    void pendientes.refetch();
    void conteo.refetch();
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        titulo="Bandeja de cobro"
        descripcion="Servicios que los colaboradores han registrado y que todavía no se han cobrado. La lista va de la más antigua a la más reciente: la primera es la que más lleva esperando."
        icono={ClipboardCheck}
        acciones={
          <>
            {pendientes.isFetching && !cargando && (
              <span className="text-body-sm text-text-muted" aria-live="polite">
                Actualizando…
              </span>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={refrescar}
              disabled={cargando}
            >
              <RefreshCw
                size={16}
                className={pendientes.isFetching ? 'animate-spin' : undefined}
                aria-hidden="true"
              />
              Actualizar
            </button>
          </>
        }
      />

      {/* ── Cuánto hay pendiente y cuánto dinero es ── */}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de la bandeja">
        <div className="panel p-4">
          <span className="text-label text-text-secondary">Pendientes de cobro</span>
          <p className="tabular mt-1 text-2xl font-bold text-text-primary">
            {formatNumero(numPendientes)}
          </p>
          <p className="mt-0.5 text-body-sm text-text-muted">
            {numPendientes === 1 ? 'Servicio esperando' : 'Servicios esperando'}
          </p>
        </div>

        <div className="panel p-4">
          <span className="text-label text-text-secondary">Dinero sin entrar</span>
          <p className="tabular mt-1 text-2xl font-bold text-accent-from">
            {formatMoney(totalPendiente)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-body-sm text-text-muted">
            <HandCoins size={12} aria-hidden="true" />
            Suma de los {formatNumero(filas.length)} que se ven
          </p>
        </div>

        <div className="panel p-4">
          <span className="text-label text-text-secondary">La más antigua</span>
          <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold text-text-primary">
            <Clock size={18} className="text-warning" aria-hidden="true" />
            {masAntigua ? formatRelativo(masAntigua) : '—'}
          </p>
          <p className="mt-0.5 text-body-sm text-text-muted">
            Un servicio de hace más de 2 h se marca en ámbar: es dinero que se enfría.
          </p>
        </div>
      </section>

      {/* ── Error o aviso de migraciones ── */}
      {error &&
        (migraciones ? (
          <div className={claseBanner('info')} role="status">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Esta función aún no está disponible</p>
              <p className="mt-1">
                No es un fallo de la pantalla ni de nadie que la esté usando: falta
                activarla. Avisa a administración.
              </p>
            </div>
          </div>
        ) : (
          <div className={claseBanner('danger')} role="alert">
            <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">No se pudieron cargar los servicios pendientes.</p>
              <p className="mt-0.5">
                Comprueba la conexión con el servidor y pulsa «Actualizar» para volver a
                intentarlo. Lo que ya estaba en pantalla se conserva.
              </p>
            </div>
          </div>
        ))}

      {/* ── Lista ── */}
      {cargando ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Cargando los servicios pendientes de cobro…</span>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel p-4">
              <div className="skeleton h-4 w-48" />
              <div className="skeleton mt-3 h-4 w-64" />
              <div className="skeleton mt-3 h-4 w-40" />
            </div>
          ))}
        </div>
      ) : filas.length === 0 ? (
        <div className="panel p-8 text-center">
          <ListChecks size={24} className="mx-auto text-text-muted" aria-hidden="true" />
          <p className="mt-2 text-body font-semibold text-text-primary">
            No hay servicios pendientes de cobro
          </p>
          <p className="mx-auto mt-1 max-w-xl text-body-sm text-text-secondary">
            Aquí aparecen los servicios que los colaboradores han registrado y aún no se han
            cobrado. Cuando el cliente pague, pulsa <strong>Cobrar</strong> en su fila: se crea
            la venta, entra el dinero en la cuenta que elijas y queda liquidada la comisión.
          </p>
        </div>
      ) : (
        <section className="space-y-3" aria-label="Servicios pendientes de cobro">
          <ul className="space-y-3">
            {filas.map((comanda) => (
              <li key={comanda.id}>
                <ComandaPendienteCard
                  comanda={comanda}
                  nombresColaboradores={nombresColaboradores}
                  onCobrar={setComandaAbierta}
                />
              </li>
            ))}
          </ul>

          {hayMasDeLasQueSeVen && (
            <p className="field-help">
              Se muestran las {formatNumero(filas.length)} más antiguas de{' '}
              {formatNumero(meta?.total ?? 0)} pendientes: la bandeja trae siempre las más
              antiguas primero, así que las de arriba son las que más urge cobrar.
            </p>
          )}
        </section>
      )}

      {comandaAbierta && (
        <CobroDrawer
          comanda={comandaAbierta}
          nombresColaboradores={nombresColaboradores}
          onClose={() => setComandaAbierta(null)}
        />
      )}
    </div>
  );
};

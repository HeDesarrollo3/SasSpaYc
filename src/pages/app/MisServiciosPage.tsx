// src/pages/app/MisServiciosPage.tsx
//
// `/app/servicios` — historial con filtros de fecha (spec §3.18).
//
// Filtros: Hoy · Esta semana · Este mes · Personalizado. Los tres primeros usan
// los rangos de `hooks/useComandas` (construidos con la zona del negocio, no con
// `toISOString()`), para que un servicio de las 20:00 no se caiga del día.
//
// Se agrupa por día y cada grupo lleva **el total comisionado del día** a la
// derecha, como pide la spec.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ListChecks } from 'lucide-react';

import { CatalogoService } from '../../services/catalog.service';
import {
  agruparPorDia,
  rangoHoy,
  rangoMesEnCurso,
  rangoPersonalizado,
  rangoSemanaEnCurso,
  useDetallesDeComandas,
  useMisComandas,
  type RangoFechas,
} from '../../hooks/useComandas';
import { formatFecha, formatMoney, nombreDia } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { AvisoApi } from '../../components/portal/AvisoApi';
import { ComandaCard, type NombresServicios } from '../../components/portal/ComandaCard';

type Preset = 'hoy' | 'semana' | 'mes' | 'personalizado';

const PRESETS: Array<{ id: Preset; etiqueta: string }> = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'semana', etiqueta: 'Esta semana' },
  { id: 'mes', etiqueta: 'Este mes' },
  { id: 'personalizado', etiqueta: 'Personalizado' },
];

/** El rango que corresponde a cada preset (el personalizado lo pone el usuario). */
function rangoDe(preset: Exclude<Preset, 'personalizado'>): RangoFechas {
  if (preset === 'hoy') return rangoHoy();
  if (preset === 'semana') return rangoSemanaEnCurso();
  return rangoMesEnCurso();
}

export function MisServiciosPage() {
  const [preset, setPreset] = useState<Preset>('semana');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const rango: RangoFechas =
    preset === 'personalizado' ? rangoPersonalizado(desde, hasta) : rangoDe(preset);

  // Con «Personalizado» sin fechas no se consulta: evita traer todo el histórico
  // sin que el colaborador lo haya pedido.
  const consultaActiva = preset !== 'personalizado' || Boolean(desde && hasta);

  const lista = useMisComandas(
    { desde: rango.desde || undefined, hasta: rango.hasta || undefined },
    { enabled: consultaActiva, limit: 100 },
  );

  const filas = lista.data?.data ?? [];
  const { detalles, cargando } = useDetallesDeComandas(filas.map((c) => c.id));

  const catalogo = useQuery({
    queryKey: ['catalogo', 'items', true],
    queryFn: () => CatalogoService.listarItems(true),
    staleTime: 5 * 60_000,
  });
  const nombres: NombresServicios = new Map(
    (catalogo.data ?? []).filter((i) => i.tipo === 'servicio').map((i) => [i.id, i.nombre]),
  );

  const grupos = useMemo(() => agruparPorDia(lista.data?.data ?? []), [lista.data]);

  /** Comisión del día: sólo lo ya persistido por la base (`comision_monto`). */
  const comisionDelDia = (ids: number[]): number => {
    let total = 0;
    for (const id of ids) {
      for (const item of detalles.get(id)?.items ?? []) {
        if (item.comision_monto !== null && item.comision_monto !== undefined) {
          total += Number(item.comision_monto);
        }
      }
    }
    return Math.round(total * 100) / 100;
  };

  const totalPeriodo = filas.reduce(
    (acc, c) => acc + Number(c.total_confirmado ?? c.total_estimado ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Mis servicios"
        descripcion="Todo lo que has registrado, agrupado por día. El importe definitivo es el que cobró recepción."
      />

      {/* Filtros */}
      <div>
        <div
          role="group"
          aria-label="Filtro de fechas"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {PRESETS.map((p) => {
            const activo = p.id === preset;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={activo}
                onClick={() => setPreset(p.id)}
                className={`min-h-12 rounded-sm border px-2 text-label transition-colors ${
                  activo
                    ? 'border-accent-from bg-accent-from/10 text-text-primary'
                    : 'border-border-subtle bg-surface-card text-text-secondary'
                }`}
              >
                {p.etiqueta}
              </button>
            );
          })}
        </div>

        {preset === 'personalizado' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="filtro-desde" className="label">
                Desde
              </label>
              <input
                id="filtro-desde"
                type="date"
                className="input tabular"
                value={desde}
                max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="filtro-hasta" className="label">
                Hasta
              </label>
              <input
                id="filtro-hasta"
                type="date"
                className="input tabular"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
            <p className="field-help sm:col-span-2">
              El rango incluye el día «Hasta» completo. Elige las dos fechas para ver resultados.
            </p>
          </div>
        )}
      </div>

      {/* Totales del periodo */}
      {consultaActiva && filas.length > 0 && (
        <div className="panel flex items-center justify-between p-3">
          <span className="text-body-sm text-text-secondary">
            {filas.length} servicio{filas.length === 1 ? '' : 's'} en el periodo
          </span>
          <span className="tabular text-h2 text-text-primary">
            {formatMoney(totalPeriodo)}
          </span>
        </div>
      )}

      {lista.error ? <AvisoApi error={lista.error} /> : null}

      {!consultaActiva ? (
        <div className="panel p-5 text-center">
          <CalendarRange size={20} className="mx-auto text-text-muted" aria-hidden="true" />
          <p className="mt-2 text-body font-semibold text-text-primary">Elige un rango de fechas</p>
          <p className="mt-1 text-body-sm text-text-secondary">
            Selecciona el día de inicio y el de fin para ver los servicios de ese periodo.
          </p>
        </div>
      ) : lista.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Cargando tus servicios…</span>
          <div className="skeleton h-6 w-32" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      ) : filas.length === 0 ? (
        <div className="panel p-5 text-center">
          <ListChecks size={20} className="mx-auto text-text-muted" aria-hidden="true" />
          <p className="mt-2 text-body font-semibold text-text-primary">
            No hay servicios en este periodo
          </p>
          <p className="mt-1 text-body-sm text-text-secondary">
            Prueba con otro filtro o registra el servicio que acabas de terminar.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(({ dia, filas: delDia }) => {
            const comision = comisionDelDia(delDia.map((c) => c.id));
            return (
              <section key={dia} aria-labelledby={`dia-${dia}`}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 id={`dia-${dia}`} className="text-h2 text-text-primary">
                    {nombreDia(delDia[0].fecha_servicio)}
                    <span className="ml-2 text-body-sm font-normal text-text-muted">
                      {formatFecha(delDia[0].fecha_servicio)}
                    </span>
                  </h2>
                  {comision > 0 && (
                    <span className="tabular shrink-0 text-label text-accent-from">
                      {formatMoney(comision)} comisionado
                    </span>
                  )}
                </div>

                <ul className="space-y-3">
                  {delDia.map((c) => (
                    <li key={c.id}>
                      <ComandaCard
                        comanda={c}
                        detalle={detalles.get(c.id)}
                        nombresServicios={nombres}
                        cargandoDetalle={cargando && !detalles.has(c.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

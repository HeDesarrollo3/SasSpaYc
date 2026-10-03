// src/pages/ReportesPage.tsx
//
// Métricas del negocio: cuánto entró, qué se vende más, cómo rinde cada
// colaborador y en qué horas y días se trabaja más.
//
// Gráficos: una sola serie por gráfico (un tono, el de la marca), barras finas
// con extremos redondeados, valores en texto (nunca sólo color) y detalle al
// pasar el cursor o tocar (title). Todo sale de `GET /reportes/resumen`.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarDays,
  Clock,
  CreditCard,
  Package,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Contact,
  Gift,
  Cake,
} from 'lucide-react';

import { PageHeader } from '../components/PageHeader';
import { ReportesService, type FilaRanking } from '../services/reportes.service';
import { formatMoney, formatNumero } from '../lib/format';
import { friendlyError } from '../utils/error-messages';

// ── Fechas (día de Colombia) ───────────────────────────────────────────────
/** `YYYY-MM-DD` → «1 oct 2026». Se lee al mediodía para que la zona no lo corra un día. */
function formatFecha(dia: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${dia}T12:00:00`));
}
function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}
function sumar(dia: string, k: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}
function lunesDe(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return sumar(dia, -dow);
}

type Preset = 'hoy' | 'semana' | 'mes' | 'mes_pasado' | '30d' | 'personalizado';
function rangoDe(p: Preset): { desde: string; hasta: string } {
  const hoy = hoyBogota();
  const primeroMes = `${hoy.slice(0, 8)}01`;
  switch (p) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case 'semana':
      return { desde: lunesDe(hoy), hasta: hoy };
    case '30d':
      return { desde: sumar(hoy, -29), hasta: hoy };
    case 'mes_pasado': {
      const finPasado = sumar(primeroMes, -1);
      return { desde: `${finPasado.slice(0, 8)}01`, hasta: finPasado };
    }
    default:
      return { desde: primeroMes, hasta: hoy };
  }
}

const PRESETS: { valor: Preset; etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'semana', etiqueta: 'Esta semana' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'mes_pasado', etiqueta: 'Mes pasado' },
  { valor: '30d', etiqueta: 'Últimos 30 días' },
  { valor: 'personalizado', etiqueta: 'Personalizado' },
];

const FORMA_PAGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  OTRO: 'Otro',
  'SIN REGISTRO': 'Sin registro',
};

// ── Piezas ──────────────────────────────────────────────────────────────────
function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior <= 0) {
    return <span className="text-xs text-text-muted">Sin datos del periodo anterior</span>;
  }
  const pct = ((actual - anterior) / anterior) * 100;
  const sube = pct >= 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${sube ? 'text-success-text' : 'text-danger-text'}`}
    >
      <Icono size={13} aria-hidden="true" />
      {sube ? '+' : ''}
      {pct.toFixed(0)} % vs. periodo anterior
    </span>
  );
}

function Kpi({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string;
  detalle?: React.ReactNode;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs font-semibold text-text-secondary">{titulo}</p>
      <p className="tabular mt-1 text-2xl font-bold text-text-primary">{valor}</p>
      {detalle && <div className="mt-1">{detalle}</div>}
    </div>
  );
}

function Seccion({
  titulo,
  icono: Icono,
  children,
  className = '',
}: {
  titulo: string;
  icono: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`}>
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Icono size={16} className="text-accent-from" />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Ranking con barra horizontal: una sola serie, un solo tono. */
function Ranking({
  filas,
  vacio,
}: {
  filas: { clave: string | number; nombre: string; sub?: string; valor: number; texto: string }[];
  vacio: string;
}) {
  if (filas.length === 0) return <p className="text-body-sm text-text-muted">{vacio}</p>;
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ol className="space-y-3">
      {filas.map((f, i) => (
        <li key={f.clave} title={`${f.nombre}: ${f.texto}`}>
          <div className="flex items-baseline justify-between gap-3 text-body-sm">
            <span className="min-w-0 truncate text-text-primary">
              <span className="tabular mr-2 text-text-muted">{i + 1}.</span>
              {f.nombre}
              {f.sub && <span className="ml-1 text-text-muted">· {f.sub}</span>}
            </span>
            <span className="tabular shrink-0 font-semibold text-text-primary">{f.texto}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-card-hover">
            <div
              className="h-2 rounded-full bg-accent-from"
              style={{ width: `${Math.max(2, (f.valor / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Columnas verticales (serie de tiempo o distribución). */
function Columnas({
  datos,
  alto = 140,
  etiquetaCada = 1,
}: {
  datos: { clave: string; etiqueta: string; valor: number; detalle: string }[];
  alto?: number;
  etiquetaCada?: number;
}) {
  const max = Math.max(...datos.map((d) => d.valor), 1);
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height: alto }} role="list">
        {datos.map((d) => (
          <div
            key={d.clave}
            role="listitem"
            className="group relative flex h-full flex-1 items-end"
            title={d.detalle}
            aria-label={d.detalle}
          >
            <div
              className="w-full rounded-t-[4px] bg-accent-from transition-opacity group-hover:opacity-80"
              style={{ height: d.valor > 0 ? `${Math.max(3, (d.valor / max) * 100)}%` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] border-t border-border-subtle pt-1">
        {datos.map((d, i) => (
          <span key={d.clave} className="flex-1 truncate text-center text-[11px] text-text-muted">
            {i % etiquetaCada === 0 ? d.etiqueta : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function rankingDe(filas: FilaRanking[]) {
  return filas.map((f) => ({
    clave: f.id,
    nombre: f.nombre,
    sub: `${formatNumero(f.cantidad)} ${f.cantidad === 1 ? 'vez' : 'veces'}`,
    valor: f.ingresos,
    texto: formatMoney(f.ingresos),
  }));
}

// ── Página ──────────────────────────────────────────────────────────────────
export const ReportesPage: React.FC = () => {
  const [preset, setPreset] = useState<Preset>('mes');
  const [personal, setPersonal] = useState(() => rangoDe('mes'));
  const rango = preset === 'personalizado' ? personal : rangoDe(preset);

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ['reportes', rango.desde, rango.hasta],
    queryFn: () => ReportesService.resumen(rango.desde, rango.hasta),
    placeholderData: (prev) => prev,
  });

  const dias = useMemo(
    () =>
      (data?.por_dia ?? []).map((d) => ({
        clave: d.dia,
        etiqueta: d.dia.slice(8),
        valor: d.ingresos,
        detalle: `${formatFecha(d.dia)}: ${formatMoney(d.ingresos)} · ${formatNumero(d.ventas)} ventas`,
      })),
    [data],
  );
  const horas = useMemo(
    () =>
      (data?.por_hora ?? [])
        .filter((h) => h.hora >= 6 && h.hora <= 22)
        .map((h) => ({
          clave: String(h.hora),
          etiqueta: `${h.hora}`,
          valor: h.ventas,
          detalle: `${h.hora}:00–${h.hora}:59: ${formatNumero(h.ventas)} ventas · ${formatMoney(h.ingresos)}`,
        })),
    [data],
  );
  const semana = useMemo(
    () =>
      (data?.por_dia_semana ?? []).map((d) => ({
        clave: d.dia,
        etiqueta: d.dia,
        valor: d.ingresos,
        detalle: `${d.dia}: ${formatMoney(d.ingresos)} · ${formatNumero(d.ventas)} ventas`,
      })),
    [data],
  );

  const k = data?.kpis;
  const totalFormas = (data?.formas_pago ?? []).reduce((a, f) => a + f.monto, 0);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        titulo="Reportes"
        descripcion="Lo que entró, lo que más se vende y cómo rinde cada colaborador. Sólo cuenta ventas cobradas."
        icono={BarChart3}
      />

      {/* Filtros en una fila */}
      <div className="panel flex flex-wrap items-end gap-2 p-3">
        {PRESETS.map((p) => (
          <button
            key={p.valor}
            type="button"
            className={preset === p.valor ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
            aria-pressed={preset === p.valor}
            onClick={() => setPreset(p.valor)}
          >
            {p.etiqueta}
          </button>
        ))}
        {preset === 'personalizado' && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-text-secondary">
              Desde
              <input
                type="date"
                className="input mt-1"
                value={personal.desde}
                max={personal.hasta}
                onChange={(e) => setPersonal((r) => ({ ...r, desde: e.target.value }))}
              />
            </label>
            <label className="text-xs text-text-secondary">
              Hasta
              <input
                type="date"
                className="input mt-1"
                value={personal.hasta}
                min={personal.desde}
                onChange={(e) => setPersonal((r) => ({ ...r, hasta: e.target.value }))}
              />
            </label>
          </div>
        )}
        <span className="ml-auto self-center text-xs text-text-muted" aria-live="polite">
          {formatFecha(rango.desde)} – {formatFecha(rango.hasta)}
          {isFetching ? ' · actualizando…' : ''}
        </span>
      </div>

      {isError && (
        <div className="banner banner-danger" role="alert">
          {friendlyError(error)}
        </div>
      )}

      {isPending && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      ) : (
        data &&
        k && (
          <>
            {/* KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                titulo="Ingresos"
                valor={formatMoney(k.ingresos)}
                detalle={<Variacion actual={k.ingresos} anterior={k.ingresos_anterior} />}
              />
              <Kpi
                titulo="Ventas"
                valor={formatNumero(k.ventas)}
                detalle={<Variacion actual={k.ventas} anterior={k.ventas_anterior} />}
              />
              <Kpi titulo="Ticket promedio" valor={formatMoney(k.ticket_promedio)} />
              <Kpi titulo="Clientes atendidos" valor={formatNumero(k.clientes_unicos)} />
              <Kpi titulo="Servicios realizados" valor={formatNumero(k.servicios_realizados)} />
              <Kpi titulo="Comisiones generadas" valor={formatMoney(k.comisiones)} />
              <Kpi
                titulo="Queda para el spa"
                valor={formatMoney(k.ingreso_despues_comisiones)}
                detalle={<span className="text-xs text-text-muted">Ingresos menos comisiones</span>}
              />
              <Kpi
                titulo="Propinas"
                valor={formatMoney(k.propinas)}
                detalle={<span className="text-xs text-text-muted">No son venta</span>}
              />
            </div>

            {/* Ingresos por día */}
            {data.periodo.dias > 1 && (
              <Seccion titulo="Ingresos por día" icono={CalendarDays}>
                <Columnas
                  datos={dias}
                  etiquetaCada={dias.length > 16 ? Math.ceil(dias.length / 10) : 1}
                />
              </Seccion>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Seccion titulo="Servicios más vendidos" icono={Sparkles}>
                <Ranking
                  filas={rankingDe(data.top_servicios)}
                  vacio="Sin servicios en el periodo."
                />
              </Seccion>
              <Seccion titulo="Productos y adicionales más vendidos" icono={Package}>
                <Ranking
                  filas={rankingDe(data.top_productos)}
                  vacio="Sin productos vendidos en el periodo."
                />
              </Seccion>
            </div>

            {/* Colaboradores */}
            <Seccion titulo="Rendimiento por colaborador" icono={Users}>
              {data.colaboradores.length === 0 ? (
                <p className="text-body-sm text-text-muted">
                  Sin ventas con colaborador en el periodo.
                </p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Colaborador</th>
                          <th className="num">Servicios</th>
                          <th className="num">Ventas</th>
                          <th className="num">Ingresos generados</th>
                          <th className="num">Ticket promedio</th>
                          <th className="num">Comisión</th>
                          <th className="num">Referidos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.colaboradores.map((c) => (
                          <tr key={c.id}>
                            <td className="strong">{c.nombre}</td>
                            <td className="num">{formatNumero(c.servicios)}</td>
                            <td className="num">{formatNumero(c.ventas)}</td>
                            <td className="num strong">{formatMoney(c.ingresos)}</td>
                            <td className="num">{formatMoney(c.ticket_promedio)}</td>
                            <td className="num">{formatMoney(c.comision)}</td>
                            <td className="num">{formatNumero(c.referidos)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="space-y-3 md:hidden">
                    {data.colaboradores.map((c) => (
                      <li key={c.id} className="rounded-lg border border-border-subtle p-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-text-primary">{c.nombre}</span>
                          <span className="tabular font-semibold text-text-primary">
                            {formatMoney(c.ingresos)}
                          </span>
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary">
                          <dt>Servicios</dt>
                          <dd className="tabular text-right">{formatNumero(c.servicios)}</dd>
                          <dt>Ticket promedio</dt>
                          <dd className="tabular text-right">{formatMoney(c.ticket_promedio)}</dd>
                          <dt>Comisión</dt>
                          <dd className="tabular text-right">{formatMoney(c.comision)}</dd>
                          <dt>Referidos</dt>
                          <dd className="tabular text-right">{formatNumero(c.referidos)}</dd>
                        </dl>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Seccion>

            {data.clientes && (
              <Seccion titulo="Clientes" icono={Contact}>
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Atendidos con ficha', formatNumero(data.clientes.atendidos)],
                    ['Nuevos', formatNumero(data.clientes.nuevos)],
                    ['Volvieron', formatNumero(data.clientes.recurrentes)],
                    [
                      'Ventas con cliente identificado',
                      data.clientes.ventas_total
                        ? `${Math.round((data.clientes.ventas_con_cliente / data.clientes.ventas_total) * 100)} %`
                        : '—',
                    ],
                  ].map(([t, v]) => (
                    <div key={t} className="rounded-md border border-border-subtle p-3">
                      <p className="text-xs text-text-muted">{t}</p>
                      <p className="tabular text-lg font-semibold text-text-primary">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                  <div>
                    <h3 className="mb-3 text-xs font-semibold text-text-secondary">
                      Mejores clientes del periodo
                    </h3>
                    <Ranking
                      filas={data.clientes.top.map((c) => ({
                        clave: c.id,
                        nombre: c.nombre,
                        sub: `${formatNumero(c.visitas)} ${c.visitas === 1 ? 'visita' : 'visitas'}`,
                        valor: c.ingresos,
                        texto: formatMoney(c.ingresos),
                      }))}
                      vacio="Aún no hay ventas con cliente guardado. Se guardan al cobrar."
                    />
                  </div>
                  <div>
                    <h3 className="mb-3 flex items-center gap-1 text-xs font-semibold text-text-secondary">
                      <Cake size={13} aria-hidden="true" /> Cumpleaños esta semana
                    </h3>
                    {data.clientes.cumpleanos.length === 0 ? (
                      <p className="text-body-sm text-text-muted">
                        Nadie cumple años en los próximos 7 días.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-body-sm">
                        {data.clientes.cumpleanos.map((c) => (
                          <li key={c.id} className="flex justify-between gap-2">
                            <span className="text-text-primary">
                              {c.nombre}
                              {!c.autoriza_datos && (
                                <span className="ml-1 text-xs text-text-muted">
                                  (sin autorización)
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-text-secondary">
                              {c.en_dias === 0
                                ? '¡Hoy!'
                                : c.en_dias === 1
                                  ? 'Mañana'
                                  : `En ${c.en_dias} días`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-3 text-xs font-semibold text-text-secondary">
                      Hace más de 60 días que no vienen
                    </h3>
                    {data.clientes.inactivos.length === 0 ? (
                      <p className="text-body-sm text-text-muted">Ningún cliente inactivo.</p>
                    ) : (
                      <ul className="space-y-2 text-body-sm">
                        {data.clientes.inactivos.map((c) => (
                          <li key={c.id} className="flex justify-between gap-2">
                            <span className="text-text-primary">{c.nombre}</span>
                            <span className="tabular shrink-0 text-text-secondary">
                              {c.dias} días
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Seccion>
            )}

            {data.combos && data.combos.length > 0 && (
              <Seccion titulo="Combos y promociones vendidos" icono={Gift}>
                <Ranking
                  filas={data.combos.map((c) => ({
                    clave: c.combo_id,
                    nombre: c.nombre,
                    sub: `${c.tipo === 'COMBO' ? 'Combo' : 'Promoción'} · ${formatNumero(c.vendidos)} ${
                      c.vendidos === 1 ? 'vez' : 'veces'
                    } · ${formatNumero(c.colaboradores)} ${
                      c.colaboradores === 1 ? 'colaborador' : 'colaboradores'
                    }`,
                    valor: c.ingresos,
                    texto: formatMoney(c.ingresos),
                  }))}
                  vacio="Ningún combo vendido en el periodo."
                />
              </Seccion>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Seccion titulo="Horas con más ventas" icono={Clock}>
                <Columnas datos={horas} alto={110} etiquetaCada={2} />
              </Seccion>
              <Seccion titulo="Ingresos por día de la semana" icono={CalendarDays}>
                <Columnas datos={semana} alto={110} />
              </Seccion>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Seccion titulo="Ingresos por categoría" icono={BarChart3}>
                <Ranking
                  filas={data.por_categoria.map((c) => ({
                    clave: c.categoria,
                    nombre: c.categoria,
                    sub: `${formatNumero(c.cantidad)} servicios`,
                    valor: c.ingresos,
                    texto: formatMoney(c.ingresos),
                  }))}
                  vacio="Sin servicios en el periodo."
                />
              </Seccion>
              <Seccion titulo="Formas de pago" icono={CreditCard}>
                <Ranking
                  filas={data.formas_pago.map((f) => ({
                    clave: f.forma,
                    nombre: FORMA_PAGO[f.forma] ?? f.forma,
                    sub: totalFormas
                      ? `${((f.monto / totalFormas) * 100).toFixed(0)} %`
                      : undefined,
                    valor: f.monto,
                    texto: formatMoney(f.monto),
                  }))}
                  vacio="Sin cobros en el periodo."
                />
              </Seccion>
            </div>
          </>
        )
      )}
    </div>
  );
};

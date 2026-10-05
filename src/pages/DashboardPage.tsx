// src/pages/DashboardPage.tsx
//
// `/dashboard` — el panel: **cómo va el día, qué hay que hacer y cómo va el mes
// frente a las metas**.
//
// ## Lo que cambió y por qué
// Antes eran **seis tarjetas idénticas** en una sola rejilla: «facturado hoy»
// pesaba visualmente lo mismo que «clientes registrados», y el único dato con
// algo que *hacer* (los servicios sin cobrar) era una tarjeta más. Ahora hay
// jerarquía: primero el dinero del día, luego **la cola de trabajo** —que se
// resalta cuando tiene trabajo— y después el apoyo. Se añade además el apartado
// de **metas** (`SeccionMetas`), que es lo que convierte una cifra en una
// decisión: cuánto falta y a qué ritmo hay que ir.
//
// ⚠️ **Antes esta página mostraba 0 siempre.** Traía `/ventas?sort=-created_at`
// y filtraba en el navegador por `created_at`, columna que la tabla `ventas`
// **no tiene** (su eje temporal es `fecha_hora`). La agregación la hace ahora
// `DashboardService.getMetrics()` y esta página sólo pinta sus campos: aquí no
// se calcula ninguna métrica de ventas ni se leen fechas de las ventas.
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Package,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { DashboardService } from '../services/dashboard.service';
import { useAuthStore } from '../stores/auth.store';
import { formatFecha, formatMoney, formatNumero, nombreDia } from '../lib/format';
import { friendlyError } from '../utils/error-messages';
import { ComparacionAyer } from '../components/dashboard/ComparacionAyer';
import { KpiCard } from '../components/dashboard/KpiCard';
import { SeccionMetas } from '../components/dashboard/SeccionMetas';

const ACCESOS: {
  label: string;
  desc: string;
  icono: LucideIcon;
  to: string;
  tono: string;
}[] = [
  {
    label: 'Cobrar',
    desc: 'Terminal POS y bandeja',
    icono: ShoppingBag,
    to: '/pos',
    tono: 'text-accent-from',
  },
  {
    label: 'Control de caja',
    desc: 'Apertura, movimientos y cierre',
    icono: Wallet,
    to: '/caja',
    tono: 'text-success',
  },
  {
    label: 'Inventario',
    desc: 'Servicios y productos',
    icono: Package,
    to: '/inventory',
    tono: 'text-accent-to',
  },
  {
    label: 'Cuentas',
    desc: 'Créditos por cobrar y pagar',
    icono: TrendingUp,
    to: '/cuentas',
    tono: 'text-warning',
  },
];

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export const DashboardPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);

  const { data, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => DashboardService.getMetrics(),
  });

  const hoy = new Date();

  const comandasPendientes = data?.comandasPendientes ?? 0;
  const ventasPendientes = data?.ventasPendientes ?? 0;
  const hayCola = comandasPendientes > 0;

  return (
    <div className="page-container space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            Hola, {user?.nombre || 'Usuario'} 👋
          </h1>
          <p className="mt-1 text-xs text-text-secondary">
            {nombreDia(hoy)} · {formatFecha(hoy)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
          {isFetching ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {isError && (
        <div className="banner banner-danger" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{friendlyError(error)} No se pudieron cargar las métricas.</span>
        </div>
      )}

      {/*
        Dos avisos DISTINTOS, y a propósito:
        · Servicios sin cobrar → el trabajo ya está hecho y el dinero está en el
          salón. Es lo accionable: el cajero lo resuelve ahora.
        · Ventas a crédito → el cliente se lo llevó fiado. Es dinero que debe.
        Antes sólo existía el segundo, y contaba `ventas` en estado PENDIENTE, así
        que **los servicios recién registrados por los colaboradores no aparecían
        por ningún lado** en el panel del administrador.
      */}
      {!isPending && !isError && hayCola && (
        <div className="banner banner-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Hay {formatNumero(comandasPendientes)}{' '}
            {comandasPendientes === 1 ? 'servicio sin cobrar' : 'servicios sin cobrar'}. Recepción o
            caja tienen que confirmar el cobro para que cuente como venta.
          </span>
          <Link to="/cobros" className="ml-auto shrink-0 font-semibold underline">
            Ir a cobrar
          </Link>
        </div>
      )}

      {!isPending && !isError && ventasPendientes > 0 && (
        <div className="banner banner-info">
          <Wallet size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {formatNumero(ventasPendientes)}{' '}
            {ventasPendientes === 1 ? 'cuenta por cobrar' : 'cuentas por cobrar'} con saldo. El
            cliente todavía debe ese dinero.
          </span>
          <Link to="/cuentas" className="ml-auto shrink-0 font-semibold underline">
            Ver cuentas
          </Link>
        </div>
      )}

      {/*
        ── Jerarquía ──
        El dinero del día ocupa dos tercios de la fila (es el dato protagonista) y
        la cola de trabajo el tercio restante. Las dos son las tarjetas grandes:
        una dice cuánto ha entrado, la otra qué queda por hacer.
      */}
      <section aria-label="Resumen del día" className="grid gap-4 lg:grid-cols-3">
        <KpiCard
          etiqueta="Ventas del día"
          valor={formatMoney(data?.ventasDia)}
          icono={DollarSign}
          tono="bg-accent-from/10 text-accent-from"
          tamano="heroe"
          className="lg:col-span-2"
          cargando={isPending}
          extra={<ComparacionAyer actual={data?.ventasDia ?? 0} anterior={data?.ventasAyer ?? 0} />}
          detalle="Ventas ya cobradas hoy."
        />

        <KpiCard
          etiqueta="Pendientes de cobro"
          valor={formatNumero(comandasPendientes)}
          icono={Clock}
          tono={hayCola ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}
          tamano="heroe"
          cargando={isPending}
          to="/cobros"
          resaltado={hayCola}
          extra={
            hayCola ? (
              <span className="badge badge-warning">
                <AlertTriangle size={12} aria-hidden="true" />
                Requiere acción
              </span>
            ) : (
              <span className="badge badge-success">
                <CheckCircle2 size={12} aria-hidden="true" />
                Cola al día
              </span>
            )
          }
          detalle={
            hayCola
              ? 'Servicios ya hechos que todavía no se han cobrado.'
              : 'No hay servicios esperando en la bandeja de cobro.'
          }
        />
      </section>

      {/*
        ── Apoyo ──
        Mismo dato de siempre, ahora en tamaño secundario: son cifras de contexto,
        no llamadas a la acción. «Ventas del mes» se pone justo antes del apartado
        de metas porque es el número con el que se compara la meta mensual.
      */}
      <section aria-label="Indicadores de apoyo" className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          etiqueta="Órdenes de hoy"
          valor={formatNumero(data?.ordenesHoy)}
          icono={ShoppingBag}
          tono="bg-accent-to/10 text-accent-to"
          tamano="compacto"
          cargando={isPending}
          detalle="Ventas cobradas hoy."
        />
        <KpiCard
          etiqueta="Ticket promedio"
          valor={formatMoney(data?.ticketPromedio)}
          icono={TrendingUp}
          tono="bg-info/10 text-info"
          tamano="compacto"
          cargando={isPending}
          detalle="Media por venta cobrada hoy."
        />
        <KpiCard
          etiqueta="Ventas del mes"
          valor={formatMoney(data?.ventasMes)}
          icono={CalendarDays}
          tono="bg-accent-from/10 text-accent-from"
          tamano="compacto"
          cargando={isPending}
          detalle="Facturado en lo que va de mes."
        />
      </section>

      {/* ── Metas ── */}
      <SeccionMetas metricas={data} cargando={isPending} hayError={isError} />

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-label="Personas" className="panel p-5 lg:col-span-2">
          <h2 className="text-sm font-bold text-text-primary">Personas</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Base de clientes y equipo disponible para asignar servicios.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/*
              ⚠️ «Clientes activos» va **sin** `to`: no existe una página de
              clientes en la app (sólo el buscador dentro del POS y de Cuentas).
              Un enlace inventado llevaría a un 404. Es un hueco real de la app,
              no un olvido.
            */}
            <KpiCard
              etiqueta="Clientes activos"
              valor={formatNumero(data?.clientesActivos)}
              icono={Users}
              tono="bg-success/10 text-success"
              tamano="compacto"
              cargando={isPending}
              detalle="Clientes registrados."
            />
            <KpiCard
              etiqueta="Colaboradores activos"
              valor={formatNumero(data?.colaboradoresActivos)}
              icono={Sparkles}
              tono="bg-accent-from/10 text-accent-from"
              tamano="compacto"
              cargando={isPending}
              to="/colaboradores"
              detalle="Personal que puede recibir servicios."
            />
          </div>
        </section>

        <section aria-label="Accesos rápidos" className="panel p-5">
          <h2 className="text-sm font-bold text-text-primary">Accesos rápidos</h2>
          <nav className="mt-4 space-y-2">
            {ACCESOS.map((a) => {
              const Icono = a.icono;
              return (
                <Link
                  key={a.to}
                  to={a.to}
                  className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface-card p-3 transition-colors hover:border-border-strong"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-sm bg-bg-elevated ${a.tono}`}
                    aria-hidden="true"
                  >
                    <Icono size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-text-primary">{a.label}</span>
                    <span className="block truncate text-[11px] text-text-muted">{a.desc}</span>
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        </section>
      </div>
    </div>
  );
};

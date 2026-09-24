import React, { useEffect, useState } from 'react';
import { DollarSign, ShoppingBag, Users, TrendingUp, Loader2 } from 'lucide-react';
import { DashboardService, type DashboardMetrics } from '../services/dashboard.service';

export const DashboardPage: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    ventasDia: 0,
    ordenesProcesadas: 0,
    clientesActivos: 0,
    ticketPromedio: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await DashboardService.getMetrics();
        setMetrics(data);
      } catch (err: any) {
        setError(err.message || 'Error al conectar con el servidor');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  const kpis = [
    {
      title: 'Ventas del Día',
      value: `$${metrics.ventasDia.toFixed(2)}`,
      change: 'Hoy',
      icon: DollarSign,
    },
    {
      title: 'Órdenes Procesadas',
      value: metrics.ordenesProcesadas.toString(),
      change: 'Hoy',
      icon: ShoppingBag,
    },
    {
      title: 'Clientes Registrados',
      value: metrics.clientesActivos.toString(),
      change: 'Total',
      icon: Users,
    },
    {
      title: 'Ticket Promedio',
      value: `$${metrics.ticketPromedio.toFixed(2)}`,
      change: 'Promedio hoy',
      icon: TrendingUp,
    },
  ];

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-text-muted">
        <Loader2 className="mb-2 animate-spin text-accent-from" size={32} />
        <p className="text-xs">Cargando métricas desde NestJS...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-text-primary">Métricas del Sistema</h1>
        <p className="mt-1 text-xs text-text-secondary">
          Resumen en tiempo real de operaciones de la sucursal.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-error/20 bg-error/10 p-4 text-center text-xs text-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={idx} className="glass-card flex items-start justify-between rounded-md p-5">
              <div>
                <p className="text-xs font-medium text-text-muted">{kpi.title}</p>
                <h3 className="mt-2 text-2xl font-bold text-text-primary">{kpi.value}</h3>
                <span className="mt-2 inline-block rounded-sm bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                  {kpi.change}
                </span>
              </div>
              <div className="rounded-sm bg-accent-from/10 p-3 text-accent-from">
                <Icon size={20} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
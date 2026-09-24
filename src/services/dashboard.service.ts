import { api, type ApiResponse } from './api';

export interface Venta {
  id: string;
  total: number;
  createdAt: string;
}

export interface Cliente {
  id: string;
}

export interface DashboardMetrics {
  ventasDia: number;
  ordenesProcesadas: number;
  clientesActivos: number;
  ticketPromedio: number;
}

export const DashboardService = {
  getMetrics: async (): Promise<DashboardMetrics> => {
    const [ventasRes, clientesRes] = await Promise.all([
      api.get<any, ApiResponse<Venta[]>>('/ventas'),
      api.get<any, ApiResponse<Cliente[]>>('/catalogo/clientes'),
    ]);

    const ventas = ventasRes.data || [];
    const clientes = clientesRes.data || [];

    // Filtrar ventas de la fecha actual
    const hoy = new Date().toISOString().split('T')[0];
    const ventasHoy = ventas.filter((v) =>
      v.createdAt?.startsWith(hoy)
    );

    const totalVentasDia = ventasHoy.reduce(
      (acc, v) => acc + Number(v.total || 0),
      0
    );
    const ordenes = ventasHoy.length;
    const ticketPromedio = ordenes > 0 ? totalVentasDia / ordenes : 0;

    return {
      ventasDia: totalVentasDia,
      ordenesProcesadas: ordenes,
      clientesActivos: clientes.length,
      ticketPromedio,
    };
  },
}; 
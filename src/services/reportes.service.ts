// src/services/reportes.service.ts
import { api, type ApiSuccess } from './api';

export interface FilaRanking {
  id: number;
  nombre: string;
  categoria?: string | null;
  cantidad: number;
  ingresos: number;
}

export interface ResumenReportes {
  periodo: {
    desde: string;
    hasta: string;
    dias: number;
    anterior: { desde: string; hasta: string };
  };
  kpis: {
    ingresos: number;
    ventas: number;
    ticket_promedio: number;
    servicios_realizados: number;
    comisiones: number;
    ingreso_despues_comisiones: number;
    propinas: number;
    clientes_unicos: number;
    ingresos_anterior: number;
    ventas_anterior: number;
  };
  por_dia: { dia: string; ingresos: number; ventas: number }[];
  por_hora: { hora: number; ventas: number; ingresos: number }[];
  por_dia_semana: { dia: string; ventas: number; ingresos: number }[];
  top_servicios: FilaRanking[];
  top_productos: FilaRanking[];
  por_categoria: { categoria: string; cantidad: number; ingresos: number }[];
  colaboradores: {
    id: number;
    nombre: string;
    servicios: number;
    ventas: number;
    ingresos: number;
    comision: number;
    referidos: number;
    ticket_promedio: number;
  }[];
  formas_pago: { forma: string; monto: number }[];
}

export const ReportesService = {
  /** `GET /reportes/resumen` — días de Colombia, inclusivos. */
  resumen: async (desde: string, hasta: string): Promise<ResumenReportes> => {
    const res = await api.get<unknown, ApiSuccess<ResumenReportes>>(
      `/reportes/resumen?desde=${desde}&hasta=${hasta}`,
    );
    return res.data;
  },
};

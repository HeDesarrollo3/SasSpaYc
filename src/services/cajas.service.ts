import { api, type ApiResponse } from './api';

export interface CajaSesion {
  id: string;
  montoInicial: number;
  montoFinal?: number;
  estado: 'ABIERTA' | 'CERRADA';
  createdAt: string;
}

export interface AperturaCajaDto {
  montoInicial: number;
}

export interface MovimientoCajaDto {
  tipo: 'INGRESO' | 'EGRESO';
  monto: number;
  motivo: string;
}

export interface CierreCajaDto {
  montoFinal: number;
}

export const CajasService = {
  // Consultar el estado actual de las cajas
  getCajas: async (): Promise<CajaSesion[]> => {
    const response = await api.get<any, ApiResponse<CajaSesion[]>>('/cajas');
    return response.data || [];
  },

  // /api/v1/cajas/apertura (POST)
  aperturar: async (dto: AperturaCajaDto): Promise<CajaSesion> => {
    const response = await api.post<any, ApiResponse<CajaSesion>>('/cajas/apertura', dto);
    return response.data as CajaSesion;
  },

  // /api/v1/cajas/movimientos (POST)
  registrarMovimiento: async (dto: MovimientoCajaDto): Promise<any> => {
    const response = await api.post<any, ApiResponse<any>>('/cajas/movimientos', dto);
    return response.data;
  },

  // /api/v1/cajas/:id/cierre (POST)
  cerrar: async (id: string, dto: CierreCajaDto): Promise<any> => {
    const response = await api.post<any, ApiResponse<any>>(`/cajas/${id}/cierre`, dto);
    return response.data;
  },
};
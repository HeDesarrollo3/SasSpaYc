import { api, type ApiResponse } from './api';

export interface CuentaCobrar {
  id: string;
  clienteId: string;
  montoTotal: number;
  montoPendiente: number;
  estado: 'PENDIENTE' | 'PAGADO';
  createdAt: string;
}

export interface CuentaPagar {
  id: string;
  proveedor: string;
  montoTotal: number;
  montoPendiente: number;
  estado: 'PENDIENTE' | 'PAGADO';
  createdAt: string;
}

export const CuentasService = {
  // Cuentas por Cobrar
  getCuentasCobrar: async (): Promise<CuentaCobrar[]> => {
    const response = await api.get<any, ApiResponse<CuentaCobrar[]>>('/cuentas-cobrar');
    return response.data || [];
  },

  registrarAbonoCliente: async (id: string, monto: number): Promise<any> => {
    const response = await api.post<any, ApiResponse<any>>(`/cuentas-cobrar/${id}/abonos`, { monto });
    return response.data;
  },

  // Cuentas por Pagar
  getCuentasPagar: async (): Promise<CuentaPagar[]> => {
    const response = await api.get<any, ApiResponse<CuentaPagar[]>>('/cuentas-pagar');
    return response.data || [];
  },

  registrarPagoProveedor: async (id: string, monto: number): Promise<any> => {
    const response = await api.post<any, ApiResponse<any>>(`/cuentas-pagar/${id}/pagos`, { monto });
    return response.data;
  },
};
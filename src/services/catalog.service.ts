import { api, type ApiResponse } from './api';

export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  stock?: number;
  codigoBarras?: string;
  categoriaId?: string;
}

export interface Servicio {
  id: string;
  nombre: string;
  precio: number;
  duracionMinutos?: number;
}

export const CatalogService = {
  getProductos: async (): Promise<Producto[]> => {
    const response = await api.get<any, ApiResponse<Producto[]>>('/catalogo/productos');
    return response.data || [];
  },

  getServicios: async (): Promise<Servicio[]> => {
    const response = await api.get<any, ApiResponse<Servicio[]>>('/catalogo/servicios');
    return response.data || [];
  },
};
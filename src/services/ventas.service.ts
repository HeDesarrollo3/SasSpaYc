import { api, type ApiResponse } from './api';

export interface Colaborador {
  id: string;
  nombre: string;
  especialidad?: string;
  activo: boolean;
}

export interface DetalleVentaInput {
  productoId?: string;
  servicioId?: string;
  colaboradorId?: string; // Para comisiones/liquidaciones
  cantidad: number;
  precioUnitario: number;
  descuento?: number;
}

export interface CrearVentaDto {
  clienteId?: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  detalles: DetalleVentaInput[];
  montoRecibido?: number;
}

export const VentasService = {
  // Crear una nueva venta en /api/v1/ventas (POST)
  crearVenta: async (dto: CrearVentaDto) => {
    const response = await api.post<any, ApiResponse<any>>('/ventas', dto);
    return response.data;
  },

  // Obtener colaboradores activos desde /api/v1/colaboradores (GET)
  getColaboradores: async (): Promise<Colaborador[]> => {
    const response = await api.get<any, ApiResponse<Colaborador[]>>('/colaboradores');
    return response.data || [];
  },
};
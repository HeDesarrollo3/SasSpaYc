import { api, type ApiResponse } from './api';

export interface ItemCatalogo {
  id: string;
  nombre: string;
  codigo?: string;
  precio: number;
  tipo: 'PRODUCTO' | 'SERVICIO';
  stock?: number;
  activo?: boolean;
}

export interface CrearItemDto {
  nombre: string;
  codigo?: string;
  precio: number;
  tipo: 'PRODUCTO' | 'SERVICIO';
  stock?: number;
}

export const InventarioService = {
  // Crear un ítem en /api/v1/catalogo (POST)
  crear: async (dto: CrearItemDto): Promise<ItemCatalogo> => {
    const response = await api.post<any, ApiResponse<ItemCatalogo>>('/catalogo/productos', dto);
    return response.data as ItemCatalogo;
  },

  // Eliminar un ítem en /api/v1/catalogo/:id (DELETE)
  eliminar: async (id: string): Promise<void> => {
    await api.delete(`/catalogo/productos${id}`);
  },
};
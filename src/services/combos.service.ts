// src/services/combos.service.ts
//
// Combos y promociones de precio fijo (migración 027, `GET/POST/PUT /catalogo/combos`).
//   · COMBO: varios servicios por un precio fijo; cada servicio tiene SU parte
//     (p. ej. $120.000 = cabello $80.000 + uñas $20.000 + cejas $20.000).
//   · PROMOCIÓN: un servicio con cantidad y precio fijo (p. ej. 2x1).
// Cada colaborador registra su servicio eligiendo el combo; comisiona sobre su parte.
import { api, type ApiSuccess } from './api';

export type TipoCombo = 'COMBO' | 'PROMOCION';
export type EstadoCombo = 'vigente' | 'programado' | 'vencido' | 'inactivo';

export interface LineaCombo {
  id?: number;
  servicio_id: number;
  cantidad: number;
  /** Parte del precio del combo para toda la cantidad de esta línea. */
  precio_referencial: number;
  servicio_nombre?: string;
  categoria?: string | null;
  /** Precio normal de catálogo × cantidad. */
  precio_normal?: number;
}

export interface Combo {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipo: TipoCombo;
  precio: number;
  precio_normal: number;
  ahorro: number;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  vigente: boolean;
  estado: EstadoCombo;
  detalles: LineaCombo[];
}

export interface GuardarCombo {
  nombre: string;
  descripcion?: string | null;
  tipo: TipoCombo;
  precio: number;
  fecha_inicio: string;
  fecha_fin: string;
  activo?: boolean;
  detalles: { servicio_id: number; cantidad: number; precio_referencial: number }[];
}

export const CombosService = {
  listar: async (soloVigentes = false): Promise<Combo[]> => {
    const res = await api.get<unknown, ApiSuccess<Combo[]>>(
      `/catalogo/combos${soloVigentes ? '?vigentes=true' : ''}`,
    );
    return res.data ?? [];
  },
  crear: async (dto: GuardarCombo): Promise<Combo> => {
    const res = await api.post<unknown, ApiSuccess<Combo>>('/catalogo/combos', dto);
    return res.data;
  },
  actualizar: async (id: number, dto: GuardarCombo): Promise<Combo> => {
    const res = await api.put<unknown, ApiSuccess<Combo>>(`/catalogo/combos/${id}`, dto);
    return res.data;
  },
  cambiarActivo: async (id: number, activo: boolean): Promise<Combo> => {
    const res = await api.patch<unknown, ApiSuccess<Combo>>(`/catalogo/combos/${id}/activo`, {
      activo,
    });
    return res.data;
  },
};

/** Parte que le toca a un servicio dentro de un combo, o `null` si no lo incluye. */
export function lineaDelServicio(combo: Combo, servicioId: number): LineaCombo | null {
  return combo.detalles.find((d) => d.servicio_id === servicioId) ?? null;
}

// src/services/asistente.service.ts — asistente de recepción (POST /asistente/*).
import { api, type ApiSuccess } from './api';

export interface ItemListaAsistente {
  etiqueta: string;
  detalle?: string;
  valor?: string;
}

export interface AccionAsistente {
  id: string;
  tipo: string;
  resumen: string;
  detalles: { etiqueta: string; valor: string }[];
  /** Segundos que le quedan antes de caducar. */
  expira_en: number;
}

export interface RespuestaAsistente {
  respuesta: string;
  accion?: AccionAsistente;
  lista?: { titulo: string; items: ItemListaAsistente[] };
  navegar?: string;
  ejecutada?: boolean;
}

export const AsistenteService = {
  orden: async (texto: string): Promise<RespuestaAsistente> => {
    const r = await api.post<unknown, ApiSuccess<RespuestaAsistente>>('/asistente/orden', {
      texto,
    });
    return r.data;
  },
  confirmar: async (id: string): Promise<RespuestaAsistente> => {
    const r = await api.post<unknown, ApiSuccess<RespuestaAsistente>>(
      `/asistente/acciones/${id}/confirmar`,
    );
    return r.data;
  },
  cancelar: async (id: string): Promise<RespuestaAsistente> => {
    const r = await api.post<unknown, ApiSuccess<RespuestaAsistente>>(
      `/asistente/acciones/${id}/cancelar`,
    );
    return r.data;
  },
};

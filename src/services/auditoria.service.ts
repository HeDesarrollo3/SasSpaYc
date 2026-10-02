// src/services/auditoria.service.ts
//
// Auditoría (`GET /auditoria`).
//
// ⚠️ **La tabla `auditoria` NO tiene columna `tabla`.** Sus columnas reales
// (verificadas contra la base — `docs/03-ESQUEMA-VERIFICADO.md` §1.6) son:
// `id, usuario_id, fecha_hora, modulo, accion, registro_id, descripcion,
//  datos_anteriores, datos_nuevos, ip_address, created_at`.
//
// El filtro anterior (`?tabla=…`) devolvía **`400 VALIDATION_ERROR`**:
// `ConsultarAuditoriaDto` expone `modulo`, `accion`, `usuario_id`, `fecha_desde`,
// `fecha_hasta`, `page`, `limit` y `sort`, con `forbidNonWhitelisted`.
//
// `modulo` y `accion` son un **vocabulario cerrado en MAYÚSCULAS** (lo normaliza
// el `@Transform` del DTO y lo valida la lista blanca de `registrar_auditoria`).
import { api, type ApiSuccess } from './api';

/** Fila real de la tabla `auditoria`. */
export interface AuditoriaLog {
  id: number;
  usuario_id: number | null;
  /** Eje temporal real de la tabla (no `created_at`). */
  fecha_hora: string;
  /** `VENTAS` · `CAJAS` · `INVENTARIO` · … (mayúsculas). */
  modulo: string;
  /** `CREAR` · `ACTUALIZAR` · `ELIMINAR` · … (mayúsculas). */
  accion: string;
  registro_id: number | null;
  descripcion: string | null;
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditoriaMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditoriaPagina {
  data: AuditoriaLog[];
  meta: AuditoriaMeta;
}

export interface AuditoriaFiltros {
  page?: number;
  limit?: number;
  /** Módulo exacto (`VENTAS`, `CAJAS`, …). */
  modulo?: string;
  /** Acción exacta (`CREAR`, `PAGAR`, …). */
  accion?: string;
  usuario_id?: number;
  /** ISO 8601; se compara con `fecha_hora`. */
  fecha_desde?: string;
  /** ISO 8601; se compara con `fecha_hora`. */
  fecha_hasta?: string;
  /** Por defecto `-fecha_hora`. */
  sort?: string;
}

export const LIMITE_AUDITORIA = 20;

export const AuditoriaService = {
  getLogs: async (filtros: AuditoriaFiltros = {}): Promise<AuditoriaPagina> => {
    const page = filtros.page ?? 1;
    const limit = filtros.limit ?? LIMITE_AUDITORIA;

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    // La tabla tiene `fecha_hora` y `created_at`; el eje temporal real es
    // `fecha_hora`, así que el orden por defecto se fija aquí de forma explícita
    // en lugar de depender del fallback del backend.
    params.set('sort', filtros.sort ?? '-fecha_hora');
    if (filtros.modulo) params.set('modulo', filtros.modulo);
    if (filtros.accion) params.set('accion', filtros.accion);
    if (filtros.usuario_id) params.set('usuario_id', String(filtros.usuario_id));
    if (filtros.fecha_desde) params.set('fecha_desde', filtros.fecha_desde);
    if (filtros.fecha_hasta) params.set('fecha_hasta', filtros.fecha_hasta);

    // El interceptor de `api` **desempaqueta** el envelope y **rechaza** en caso
    // de error: lo que resuelve esta promesa es siempre `ApiSuccess<T>`
    // (con `ApiResponse<T>` — la unión — `.data` daría `TS2339`).
    const res = await api.get<unknown, ApiSuccess<AuditoriaLog[]>>(`/auditoria?${params.toString()}`);

    return {
      data: res.data ?? [],
      meta: res.meta ?? { page, limit, total: 0, totalPages: 1 },
    };
  },
};

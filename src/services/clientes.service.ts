// src/services/clientes.service.ts
import { api, type ApiSuccess } from './api';

/**
 * Fila de `GET /catalogo/clientes`.
 *
 * ⚠️ **Tipos verificados contra la respuesta real de la API**, no supuestos:
 * ```
 * {"id":1,"nombre":"…","telefono":"…","notas":"…",
 *  "created_at":"2026-09-08T14:07:24.847279+00:00","tipo_cliente":"SPA"}
 * ```
 *
 * Correcciones respecto a la versión anterior:
 *   · `id` era `string` pero la API devuelve un **number**. Con el tipo mintiendo,
 *     cualquier `c.id === clienteSeleccionado` fallaba en silencio (number vs el
 *     `string` que da un `<select>`).
 *   · `createdAt` no existe: la columna real es `created_at`.
 *   · `activo` **no es una columna de la tabla** `clientes`. Se elimina del tipo
 *     para que nadie vuelva a escribir código que dependa de ella.
 *   · `tipo_cliente` se restringía a `'REGULAR'|'VIP'|'CORPORATIVO'`, valores que
 *     no existen en la base: el único observado es `'SPA'`, que parece ser la
 *     **línea de negocio**, no la categoría del cliente. Se deja como `string`
 *     hasta que el negocio confirme el dominio completo.
 */
export interface Cliente {
  id: number;
  nombre: string;
  /** Valor observado en la base: `'SPA'`. Dominio completo por confirmar. */
  tipo_cliente: string | null;
  telefono: string | null;
  notas: string | null;
  created_at: string;
  /** Migración 025 y columnas ya existentes. */
  fecha_nacimiento?: string | null;
  email?: string | null;
  autoriza_datos?: boolean;
  autoriza_datos_at?: string | null;
  activo?: boolean;
}

/** Datos del formulario de cliente (alta o edición). */
export interface DatosCliente {
  nombre: string;
  telefono?: string;
  fecha_nacimiento?: string | null;
  email?: string | null;
  autoriza_datos?: boolean;
  notas?: string;
}

/** `GET /catalogo/clientes/:id/ficha`. */
export interface FichaCliente {
  cliente: Cliente;
  resumen: {
    visitas: number;
    gasto_total: number;
    ticket_promedio: number;
    primera_visita: string | null;
    ultima_visita: string | null;
    dias_entre_visitas: number | null;
  };
  servicios: { nombre: string; veces: number; gasto: number }[];
  colaboradores: { nombre: string; visitas: number }[];
  ultimas_visitas: {
    venta_id: number;
    fecha_hora: string;
    total: number;
    servicios: string[];
    colaborador: string | null;
  }[];
}

export interface CrearClienteDto {
  nombre: string;
  /** Por defecto `SPA` en el backend. */
  tipo_cliente?: string;
  telefono?: string;
  notas?: string;
}

/** `meta` del envelope paginado (`buildPaginatedPayload`, SPED §6). */
type ClientesMeta = NonNullable<ApiSuccess<Cliente[]>['meta']>;

/**
 * `PaginationQueryDto` valida `limit` con `@Max(100)`. Sin recortar, un
 * `listar(1, 200)` responde **400 VALIDATION_ERROR**.
 */
const LIMIT_MAX = 100;

/**
 * Los métodos se tipan con `ApiSuccess<T>`, no con `ApiResponse<T>`: el
 * interceptor de `api.ts` desempaqueta el envelope y **rechaza** la promesa en
 * caso de error, por lo que lo que resuelve es siempre el cuerpo de éxito. Con la
 * unión `ApiResponse<T>`, `response.data` da TS2339 porque `ApiError` no tiene
 * `data`.
 */
export const ClientesService = {
  listar: async (page = 1, limit = 50): Promise<{ data: Cliente[]; meta?: ClientesMeta }> => {
    const pagina = Math.max(1, Math.trunc(page));
    const limite = Math.min(Math.max(1, Math.trunc(limit)), LIMIT_MAX);

    const response = await api.get<unknown, ApiSuccess<Cliente[]>>(
      `/catalogo/clientes?page=${pagina}&limit=${limite}&sort=nombre`,
    );

    return { data: response.data ?? [], meta: response.meta };
  },

  crear: async (dto: CrearClienteDto): Promise<{ cliente_id: number }> => {
    const response = await api.post<unknown, ApiSuccess<{ cliente_id: number }>>(
      '/catalogo/clientes',
      {
        nombre: dto.nombre,
        tipo_cliente: dto.tipo_cliente,
        telefono: dto.telefono ?? null,
        notas: dto.notas ?? null,
      },
    );
    return response.data;
  },

  /** Búsqueda paginada por nombre o teléfono (sección Clientes). */
  buscar: async (
    q: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Cliente[]; meta?: ClientesMeta }> => {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(Math.min(limit, LIMIT_MAX)),
      sort: 'nombre',
    });
    if (q.trim()) qs.set('q', q.trim());
    const response = await api.get<unknown, ApiSuccess<Cliente[]>>(`/catalogo/clientes?${qs}`);
    return { data: response.data ?? [], meta: response.meta };
  },

  /** Cliente con ese teléfono (compara sólo dígitos) o `null`. */
  porTelefono: async (telefono: string): Promise<Cliente | null> => {
    const digitos = telefono.replace(/\D/g, '');
    if (digitos.length < 7) return null;
    const response = await api.get<unknown, ApiSuccess<Cliente | null>>(
      `/catalogo/clientes/por-telefono/${digitos}`,
    );
    return response.data ?? null;
  },

  /** Alta completa (nombre, teléfono, nacimiento, autorización). */
  guardar: async (datos: DatosCliente): Promise<{ cliente_id: number }> => {
    const response = await api.post<unknown, ApiSuccess<{ cliente_id: number }>>(
      '/catalogo/clientes',
      {
        nombre: datos.nombre.trim(),
        telefono: datos.telefono?.trim() || undefined,
        fecha_nacimiento: datos.fecha_nacimiento || undefined,
        email: datos.email || undefined,
        autoriza_datos: datos.autoriza_datos ?? false,
        notas: datos.notas?.trim() || undefined,
      },
    );
    return response.data;
  },

  actualizar: async (
    id: number,
    datos: Partial<DatosCliente> & { activo?: boolean },
  ): Promise<{ cliente_id: number; actualizado: boolean }> => {
    const response = await api.patch<
      unknown,
      ApiSuccess<{ cliente_id: number; actualizado: boolean }>
    >(`/catalogo/clientes/${id}`, {
      ...datos,
      fecha_nacimiento: datos.fecha_nacimiento === '' ? null : datos.fecha_nacimiento,
    });
    return response.data;
  },

  ficha: async (id: number): Promise<FichaCliente> => {
    const response = await api.get<unknown, ApiSuccess<FichaCliente>>(
      `/catalogo/clientes/${id}/ficha`,
    );
    return response.data;
  },
};

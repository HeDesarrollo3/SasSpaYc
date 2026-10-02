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
}

export interface CrearClienteDto {
  nombre: string;
  /** Obligatorio en el backend (`p_tipo_cliente`). */
  tipo_cliente: string;
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
  listar: async (
    page = 1,
    limit = 50,
  ): Promise<{ data: Cliente[]; meta?: ClientesMeta }> => {
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
};

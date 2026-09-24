// src/services/api.ts
import axios, { AxiosError } from 'axios';

/**
 * Envelope de respuesta del backend (SPED §5).
 * - Éxito: `{ success: true, statusCode, data, meta?, timestamp }`
 * - Error: `{ success: false, statusCode, error, message, timestamp }`
 */
export type ApiSuccess<T> = {
  success: true;
  statusCode: number;
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
  timestamp: string;
};

export type ApiError = {
  success: false;
  statusCode: number;
  error: string;      // código estable: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, ...
  message: string;
  timestamp: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Callback global para que el auth store reaccione a 401 (logout, mensajes, etc.). */
type UnauthorizedHandler = (reason: string, message: string) => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// Request: inyecta el token (Supabase lo mantiene fresco vía onAuthStateChange)
// ---------------------------------------------------------------------------
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Response: desempaqueta el envelope y normaliza errores (SPED §5)
// ---------------------------------------------------------------------------
api.interceptors.response.use(
  // El interceptor devuelve el cuerpo ya, no el AxiosResponse.
  (response) => response.data,
  (error: AxiosError<ApiError>) => {
    const status = error.response?.status ?? 500;
    const body = error.response?.data;
    const code = body?.error ?? 'NETWORK_ERROR';
    const message = body?.message ?? 'Error de conexión con el servidor';

    // Manejo global de sesión inválida (SPED §5)
    if (status === 401) {
      const reason = code; // UNAUTHORIZED | USER_INACTIVE | USER_NOT_REGISTERED
      if (onUnauthorized) {
        onUnauthorized(reason, message);
      } else {
        // Fallback si el store aún no registró su handler
        localStorage.removeItem('access_token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    // Rechazamos con el cuerpo del error (envelope) para que los hooks lean `.error`
    return Promise.reject({
      success: false,
      statusCode: status,
      error: code,
      message,
      timestamp: new Date().toISOString(),
    } satisfies ApiError);
  },
);
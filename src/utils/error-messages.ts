// src/utils/error-messages.ts
import type { ApiError } from '../services/api';

const MAP: Record<string, string> = {
  VALIDATION_ERROR: 'Revisa los datos del formulario.',
  DUPLICATE_ENTRY: 'Ya existe un registro con esos datos.',
  NOT_FOUND: 'El registro no existe o fue eliminado.',
  FORBIDDEN: 'No tienes permisos para realizar esta acción.',
  UNAUTHORIZED: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  USER_INACTIVE: 'Tu usuario está desactivado. Contacta al administrador.',
  INVALID_PERCENTAGE: 'El porcentaje debe estar entre 0 y 100.',
  INVALID_ROLE: 'El rol seleccionado no es válido.',
  FOREIGN_KEY_VIOLATION: 'Referencia inválida a otro registro.',
  INSUFFICIENT_STOCK: 'No hay stock suficiente.',
  INSUFFICIENT_FUNDS: 'Fondos insuficientes.',
  INVALID_STATE: 'La operación no es válida en el estado actual.',
  INTERNAL_ERROR: 'Error interno del servidor. Reintenta en unos segundos.',
  NETWORK_ERROR: 'No hay conexión con el servidor.',
};

export function friendlyError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Algo salió mal.';
  const e = err as Partial<ApiError>;
  if (e.error && MAP[e.error]) return MAP[e.error];
  return e.message ?? 'Algo salió mal.';
}
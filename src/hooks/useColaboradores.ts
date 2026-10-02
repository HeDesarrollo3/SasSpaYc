// src/hooks/useColaboradores.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ColaboradoresService,
  type ListarFiltros,
} from '../services/colaboradores.service';
import type { Paginated } from '../services/api';
import type {
  ActualizarColaboradorInput,
  Colaborador,
  CrearColaboradorInput,
} from '../types/colaborador.types';

const KEY = 'colaboradores';

/**
 * Listado de colaboradores **ya mapeado a `Colaborador`** (camelCase).
 *
 * El mapper vive en `ColaboradoresService.listar()` y el tipo de retorno lo
 * declara: por eso aquí `data.data` es `Colaborador[]` y no
 * `BackendColaborador[]`. No hay que volver a mapear en la página.
 */
export function useColaboradoresList(filtros: ListarFiltros) {
  return useQuery<Paginated<Colaborador>>({
    queryKey: [KEY, 'list', filtros],
    queryFn: () => ColaboradoresService.listar(filtros),
    placeholderData: (prev) => prev, // mantiene datos anteriores al cambiar de página
  });
}

export function useCrearColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearColaboradorInput) => ColaboradoresService.crear(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useActualizarColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; input: ActualizarColaboradorInput }) =>
      ColaboradoresService.actualizar(vars.id, vars.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDesactivarColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => ColaboradoresService.desactivar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

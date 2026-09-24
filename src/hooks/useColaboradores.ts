// src/hooks/useColaboradores.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ColaboradoresService,
  type ListarFiltros,
} from '../services/colaboradores.service';
import type {
  ActualizarColaboradorInput,
  CrearColaboradorInput,
} from '../types/colaborador.types';

const KEY = 'colaboradores';

export function useColaboradoresList(filtros: ListarFiltros) {
  return useQuery({
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
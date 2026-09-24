import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UsuariosService,
  type ListarUsuariosFiltros,
} from '../services/usuarios.service';
import type {
  ActualizarUsuarioInput,
  CrearUsuarioInput,
} from '../types/usuario.types';

const KEY = 'usuarios';

export function useUsuariosList(filtros: ListarUsuariosFiltros) {
  return useQuery({
    queryKey: [KEY, 'list', filtros],
    queryFn: () => UsuariosService.listar(filtros),
    placeholderData: (prev) => prev,
  });
}

export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearUsuarioInput) => UsuariosService.crear(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useActualizarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; input: ActualizarUsuarioInput }) =>
      UsuariosService.actualizar(vars.id, vars.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDesactivarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => UsuariosService.desactivar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useInvitarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearUsuarioInput) => UsuariosService.invitar(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
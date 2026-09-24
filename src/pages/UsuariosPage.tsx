import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Users, Pencil, Power, AlertCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearUsuarioSchema,
  actualizarUsuarioSchema,
  ROLES_VALIDOS,
  type CrearUsuarioInput,
  type ActualizarUsuarioInput,
  type Usuario,
} from '../types/usuario.types';
import {
  useUsuariosList,
  useInvitarUsuario,
  useActualizarUsuario,
  useDesactivarUsuario,
} from '../hooks/useUsuarios';
import { friendlyError } from '../utils/error-messages';
import { useAuthStore } from '../stores/auth.store';

export const UsuariosPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [formVisible, setFormVisible] = useState(false);

  const currentUser = useAuthStore((s) => s.user);

  const { data, isLoading, error } = useUsuariosList({
    page,
    limit: 20,
    sort: '-created_at',
  });

  const desactivar = useDesactivarUsuario();

  const handleDesactivar = (u: Usuario) => {
    if (currentUser?.id === u.id) {
      toast.error('No puedes desactivar tu propio usuario');
      return;
    }
    if (!window.confirm(`¿Desactivar a ${u.nombre}?`)) return;
    desactivar.mutate(u.id, {
      onSuccess: () => toast.success('Usuario desactivado'),
      onError: (err) => toast.error(friendlyError(err)),
    });
  };

  const filtrados = (data?.data ?? []).filter((u) =>
    q
      ? u.nombre.toLowerCase().includes(q.toLowerCase()) ||
        u.email.toLowerCase().includes(q.toLowerCase())
      : true,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Users size={24} className="text-accent-from" /> Usuarios
          </h1>
          <p className="mt-1 text-xs text-text-secondary">
            Gestión de usuarios del sistema y sus roles.
          </p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setFormVisible(true);
          }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> Nuevo usuario
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-xs text-danger flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{friendlyError(error)}</span>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-3 text-text-muted" />
        <input
          type="search"
          placeholder="Buscar por nombre o email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full bg-surface-card border border-border-subtle rounded-sm py-2 pl-10 pr-3 text-sm text-text-primary focus:border-border-strong transition-colors"
        />
      </div>

      <div className="glass-card overflow-hidden rounded-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-elevated/50 border-b border-border-subtle text-[11px] text-text-muted">
                <th className="p-4 font-semibold">Nombre</th>
                <th className="p-4 font-semibold">Email</th>
                <th className="p-4 font-semibold">Rol</th>
                <th className="p-4 font-semibold text-center">Estado</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-sm text-text-primary">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="p-4">
                      <div className="skeleton h-4 w-full" />
                    </td>
                  </tr>
                ))}

              {!isLoading &&
                filtrados.map((u) => (
                  <tr key={u.id} className="hover:bg-bg-elevated/30 transition-colors">
                    <td className="p-4 font-medium">{u.nombre}</td>
                    <td className="p-4 text-text-secondary">{u.email}</td>
                    <td className="p-4">
                      <span className="bg-accent-from/10 text-accent-from px-2 py-1 rounded-sm text-xs font-semibold capitalize">
                        {u.rol}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {u.activo ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-success bg-success/10 px-2 py-0.5 rounded-sm">
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-muted bg-surface-card px-2 py-0.5 rounded-sm">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditando(u);
                            setFormVisible(true);
                          }}
                          className="p-2 rounded-sm border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
                          aria-label={`Editar ${u.nombre}`}
                        >
                          <Pencil size={14} />
                        </button>
                        {u.activo && u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDesactivar(u)}
                            className="p-2 rounded-sm border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                            aria-label={`Desactivar ${u.nombre}`}
                          >
                            <Power size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading && filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-text-muted text-xs">
                    No hay usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data?.meta && (
          <div className="flex items-center justify-between p-4 border-t border-border-subtle text-xs text-text-secondary">
            <span>
              Página {data.meta.page} de {data.meta.totalPages} · {data.meta.total} registros
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 rounded-sm border border-border-subtle hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 rounded-sm border border-border-subtle hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {formVisible && (
        <UsuarioModal
          key={editando?.id ?? 'nuevo'}
          usuario={editando}
          onClose={() => setFormVisible(false)}
        />
      )}
    </div>
  );
};

// ============================================================================
// Modal
// ============================================================================
const UsuarioModal: React.FC<{
  usuario: Usuario | null;
  onClose: () => void;
}> = ({ usuario, onClose }) => {
  const isEdit = !!usuario;
  const crear = useInvitarUsuario();
  const actualizar = useActualizarUsuario();

  const crearForm = useForm<CrearUsuarioInput>({
    resolver: zodResolver(crearUsuarioSchema),
    defaultValues: { rol: 'cajero', activo: true },
  });

  const editForm = useForm<ActualizarUsuarioInput>({
    resolver: zodResolver(actualizarUsuarioSchema),
    defaultValues: usuario
      ? { nombre: usuario.nombre, rol: usuario.rol, activo: usuario.activo }
      : undefined,
  });

  const form = isEdit ? editForm : crearForm;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit = async (input: any) => {
    try {
      if (isEdit) {
        await actualizar.mutateAsync({ id: usuario!.id, input });
        toast.success('Usuario actualizado');
      } else {
        await crear.mutateAsync(input);
toast.success('Invitación enviada. El usuario recibirá un email.');
      }
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-card w-full max-w-lg p-6">
        <header className="mb-4">
          <h2 className="text-lg font-bold text-text-primary">
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
          </h2>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Nombre completo
            </label>
            <input
              {...register('nombre')}
              className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-border-strong"
            />
            {errors.nombre && (
              <p className="mt-1 text-[11px] text-danger">{errors.nombre.message}</p>
            )}
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                {...register('email')}
                className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-border-strong"
              />
              {(errors as any).email && (
                <p className="mt-1 text-[11px] text-danger">{(errors as any).email.message}</p>
              )}
            </div>
          )}

          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                value={usuario!.email}
                disabled
                className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-muted cursor-not-allowed"
              />
              <p className="mt-1 text-[11px] text-text-muted">
                El email no puede modificarse desde aquí.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">Rol</label>
            <select
              {...register('rol')}
              className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-border-strong"
            >
              {ROLES_VALIDOS.map((r) => (
                <option key={r} value={r} className="bg-bg-elevated">
                  {r}
                </option>
              ))}
            </select>
            {errors.rol && (
              <p className="mt-1 text-[11px] text-danger">{errors.rol.message}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="activo"
              type="checkbox"
              {...register('activo')}
              className="w-4 h-4 accent-[var(--color-accent-from)]"
            />
            <label htmlFor="activo" className="text-xs text-text-secondary">
              Activo
            </label>
          </div>

          <footer className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs rounded-sm border border-border-subtle text-text-secondary hover:text-text-primary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary text-xs"
            >
              {isSubmitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
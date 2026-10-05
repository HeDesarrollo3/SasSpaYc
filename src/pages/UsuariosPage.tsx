// src/pages/UsuariosPage.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Mail,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  crearUsuarioSchema,
  ROLES_VALIDOS,
  type Usuario,
  type UsuarioFormInput,
  type UsuarioFormOutput,
} from '../types/usuario.types';
import {
  useActualizarUsuario,
  useDesactivarUsuario,
  useInvitarUsuario,
  useUsuariosList,
} from '../hooks/useUsuarios';
import { friendlyError } from '../utils/error-messages';
import { formatFecha, formatNumero, iniciales } from '../lib/format';
import { claseBadge, metaEstado, ROL } from '../lib/estados';
import { PageHeader } from '../components/PageHeader';
import { useAuthStore } from '../stores/auth.store';
import { useQuery } from '@tanstack/react-query';
import { ColaboradoresService } from '../services/colaboradores.service';

const LIMIT = 20;

type FiltroEstado = 'activos' | 'inactivos' | 'todos';

/** Esc cierra el drawer/modal. Requisito del design system. */
function useCerrarConEsc(cerrar: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cerrar]);
}

// ============================================================================
// Página principal
// ============================================================================
export const UsuariosPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('activos');
  const [formVisible, setFormVisible] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [aDesactivar, setADesactivar] = useState<Usuario | null>(null);

  const currentUser = useAuthStore((s) => s.user);

  const { data, isLoading, isFetching, error } = useUsuariosList({
    page,
    limit: LIMIT,
    sort: '-created_at',
  });

  const desactivar = useDesactivarUsuario();

  const meta = data?.meta;
  const usuarios = data?.data ?? [];
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  // `GET /usuarios` sólo acepta `page`/`limit`/`sort` (el backend valida la query
  // con `forbidNonWhitelisted`), así que la búsqueda y el filtro de estado se
  // aplican aquí, en memoria, sobre la página ya cargada.
  const texto = q.trim().toLowerCase();
  const visibles = usuarios.filter((u) => {
    if (estado !== 'todos' && u.activo !== (estado === 'activos')) return false;
    if (!texto) return true;
    return u.nombre.toLowerCase().includes(texto) || u.email.toLowerCase().includes(texto);
  });

  // Cualquier cambio de filtro vuelve a la página 1: si no, se pide una página
  // que ya no existe para el filtro nuevo y la lista sale vacía.
  const cambiarBusqueda = useCallback((v: string) => {
    setQ(v);
    setPage(1);
  }, []);
  const cambiarEstado = useCallback((v: FiltroEstado) => {
    setEstado(v);
    setPage(1);
  }, []);

  const abrirCrear = useCallback(() => {
    setEditando(null);
    setFormVisible(true);
  }, []);
  const abrirEditar = useCallback((u: Usuario) => {
    setEditando(u);
    setFormVisible(true);
  }, []);
  const cerrarForm = useCallback(() => setFormVisible(false), []);
  const cancelarDesactivar = useCallback(() => setADesactivar(null), []);

  const confirmarDesactivar = () => {
    if (!aDesactivar) return;
    const objetivo = aDesactivar;
    desactivar.mutate(objetivo.id, {
      onSuccess: () => {
        toast.success(`${objetivo.nombre} fue desactivado`);
        setADesactivar(null);
      },
      onError: (err) => toast.error(friendlyError(err)),
    });
  };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        titulo="Usuarios"
        descripcion={
          <>
            {formatNumero(total)} {total === 1 ? 'usuario registrado' : 'usuarios registrados'}
            {' · '}accesos, roles y estado de las cuentas del sistema.
          </>
        }
        icono={Users}
        acciones={
          <button type="button" onClick={abrirCrear} className="btn-primary">
            <Plus size={16} /> Nuevo usuario
          </button>
        }
      />

      {error && (
        <div className="banner banner-danger" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{friendlyError(error)}</span>
        </div>
      )}

      <div className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="filtro-usuarios" className="label">
            <Search size={12} className="mr-1 inline" /> Buscar por nombre o correo
          </label>
          <input
            id="filtro-usuarios"
            type="search"
            className="input"
            placeholder="Ej. Ana o ana@spa.com"
            value={q}
            onChange={(e) => cambiarBusqueda(e.target.value)}
          />
        </div>

        <div className="sm:w-52">
          <label htmlFor="filtro-estado-usuarios" className="label">
            Estado
          </label>
          <select
            id="filtro-estado-usuarios"
            className="select"
            value={estado}
            onChange={(e) => cambiarEstado(e.target.value as FiltroEstado)}
          >
            <option value="activos">Sólo activos</option>
            <option value="inactivos">Sólo inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>

        <p className="flex items-center gap-1 text-body-sm text-text-muted sm:w-44 sm:justify-end">
          {isFetching && !isLoading ? (
            <>
              <RefreshCw size={12} className="animate-spin" /> Actualizando…
            </>
          ) : (
            `${formatNumero(visibles.length)} de ${formatNumero(usuarios.length)} en pantalla`
          )}
        </p>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">Usuarios del sistema</caption>
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Alta</th>
                <th scope="col" className="num">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5}>
                      <div className="skeleton h-4 w-full" />
                    </td>
                  </tr>
                ))}

              {!isLoading &&
                visibles.map((u) => (
                  <tr key={u.id}>
                    <td className="strong">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-label text-text-secondary"
                        >
                          {iniciales(u.nombre)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-text-primary">{u.nombre}</span>
                          <span className="block truncate text-body-sm text-text-muted">
                            {u.email}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={claseBadge(metaEstado(ROL, u.rol).tono)}>
                        {metaEstado(ROL, u.rol).label}
                      </span>
                    </td>
                    <td>
                      <span className={claseBadge(u.activo ? 'success' : 'neutral')}>
                        {u.activo ? <CheckCircle2 size={12} /> : <Ban size={12} />}
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>{formatFecha(u.createdAt)}</td>
                    <td className="num">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => abrirEditar(u)}
                          className="btn-icon"
                          aria-label={`Editar a ${u.nombre}`}
                        >
                          <Pencil size={15} />
                        </button>
                        {/* Un administrador no puede desactivarse a sí mismo: si lo
                            hiciera, se quedaría fuera del sistema en el acto. */}
                        {u.activo && u.id !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => setADesactivar(u)}
                            className="btn-icon"
                            aria-label={`Desactivar a ${u.nombre}`}
                          >
                            {/* El color va en el ícono: `.btn-icon` es CSS de
                                `@layer components` y `text-danger` lo sobreescribe. */}
                            <Power size={15} className="text-danger" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading && visibles.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center gap-3 p-8 text-center">
                      <Users size={26} className="text-text-muted" />
                      <p className="text-body font-semibold text-text-primary">
                        {usuarios.length === 0
                          ? 'No hay usuarios registrados.'
                          : 'Ningún usuario de esta página coincide con el filtro.'}
                      </p>
                      <p className="max-w-md text-body-sm text-text-secondary">
                        Ajusta la búsqueda o el estado. Cada usuario necesita una cuenta con su
                        propio rol para poder entrar al sistema.
                      </p>
                      <button type="button" onClick={abrirCrear} className="btn-secondary">
                        <Plus size={14} /> Nuevo usuario
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && meta && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border-subtle p-4 sm:flex-row">
            <p className="text-body-sm text-text-secondary">
              Página {formatNumero(meta.page)} de {formatNumero(meta.totalPages)} ·{' '}
              {formatNumero(meta.total)} {meta.total === 1 ? 'usuario' : 'usuarios'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="btn-secondary"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="btn-secondary"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {formVisible && (
        <UsuarioDrawer key={editando?.id ?? 'nuevo'} usuario={editando} onClose={cerrarForm} />
      )}

      {aDesactivar && (
        <ConfirmarDesactivar
          usuario={aDesactivar}
          procesando={desactivar.isPending}
          onCancelar={cancelarDesactivar}
          onConfirmar={confirmarDesactivar}
        />
      )}
    </div>
  );
};

// ============================================================================
// Drawer de invitar / editar
// ============================================================================
const UsuarioDrawer: React.FC<{
  usuario: Usuario | null;
  onClose: () => void;
}> = ({ usuario, onClose }) => {
  const isEdit = !!usuario;
  const invitar = useInvitarUsuario();
  const actualizar = useActualizarUsuario();

  useCerrarConEsc(onClose);

  /**
   * UN solo `useForm` para alta y edición.
   *
   * Antes había dos formularios (`crearForm`/`editForm`) y se elegía con
   * `const form = isEdit ? editForm : crearForm`: eso convertía `register` en la
   * unión de dos firmas incompatibles y TypeScript dejaba de considerarlo
   * invocable (los cuatro TS2349). El DTO de edición sólo excluye `email` y
   * `auth_user_id`, así que la edición reutiliza el mismo formulario y
   * simplemente no envía el correo.
   *
   * Tres genéricos: `z.input` (lo que manejan los inputs, con `activo` opcional)
   * y `z.output` (lo que recibe `onSubmit`, ya con `activo: boolean`). Sin el
   * tercero, `activo?: boolean | undefined` no encaja con `activo: boolean` del
   * `Resolver` (TS2322 en la llamada a `useForm`).
   */
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UsuarioFormInput, unknown, UsuarioFormOutput>({
    resolver: zodResolver(crearUsuarioSchema),
    defaultValues: {
      nombre: usuario?.nombre ?? '',
      email: usuario?.email ?? '',
      rol: usuario?.rol ?? 'cajero',
      activo: usuario?.activo ?? true,
    },
  });

  /**
   * `useWatch` (no `watch()`): devuelve el valor reactivo sin exponer una función
   * que React Compiler no puede memoizar sin arriesgar UI obsoleta.
   */
  const rol = useWatch({ control, name: 'rol' });

  // Fichas de colaborador para vincular un usuario con rol «colaborador».
  const [fichaId, setFichaId] = useState('');
  const fichas = useQuery({
    queryKey: ['colaboradores', 'list', { activo: true, limit: 100 }],
    queryFn: () => ColaboradoresService.listar({ activo: true, limit: 100 }),
    enabled: rol === 'colaborador',
  });

  const onSubmit = async (input: UsuarioFormOutput) => {
    if (!usuario && input.rol === 'colaborador' && !fichaId) {
      toast.error('Elige la ficha de colaborador de esta persona.');
      return;
    }
    try {
      if (usuario) {
        // `ActualizarUsuarioDto` sólo acepta nombre/rol/activo: el correo no se
        // puede cambiar desde aquí.
        await actualizar.mutateAsync({
          id: usuario.id,
          input: { nombre: input.nombre, rol: input.rol, activo: input.activo },
        });
        toast.success('Usuario actualizado');
      } else {
        // `POST /usuarios/invitar`: crea la cuenta en Supabase Auth, envía el
        // correo y registra el perfil. El DTO no acepta `activo`, así que la
        // cuenta nace activa.
        await invitar.mutateAsync({
          nombre: input.nombre,
          email: input.email,
          rol: input.rol,
          activo: input.activo,
          colaborador_id: input.rol === 'colaborador' ? Number(fichaId) : null,
        });
        toast.success('Invitación enviada. El usuario recibirá un correo.');
      }
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usuario-drawer-titulo"
      >
        <header className="drawer-header">
          <div>
            <h2 id="usuario-drawer-titulo" className="text-h2 text-text-primary">
              {isEdit ? 'Editar usuario' : 'Invitar usuario'}
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              {isEdit
                ? 'Modifica el nombre, el rol o el estado de la cuenta.'
                : 'Se creará la cuenta y se enviará un correo de invitación para que establezca su contraseña.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon"
            aria-label="Cerrar formulario"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="drawer-body space-y-4">
            <div>
              <label htmlFor="usu-nombre" className="label">
                Nombre completo *
              </label>
              <input
                id="usu-nombre"
                type="text"
                className="input"
                autoComplete="name"
                aria-invalid={errors.nombre ? 'true' : 'false'}
                {...register('nombre')}
              />
              {errors.nombre && (
                <p className="field-error" role="alert">
                  <AlertCircle size={12} /> {errors.nombre.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="usu-email" className="label">
                <Mail size={12} className="mr-1 inline" /> Correo electrónico
                {isEdit ? '' : ' *'}
              </label>
              {/* En edición el correo no se toca: identifica la cuenta en Supabase
                  Auth. Se muestra deshabilitado y **sin** `register`, porque un
                  input deshabilitado devolvería `undefined` y rompería la
                  validación del esquema (el valor viaja por `defaultValues`). */}
              {isEdit ? (
                <>
                  <input
                    id="usu-email"
                    type="email"
                    className="input"
                    value={usuario?.email ?? ''}
                    disabled
                  />
                  <p className="field-help">
                    El correo no puede modificarse: es el identificador de la cuenta.
                  </p>
                </>
              ) : (
                <>
                  <input
                    id="usu-email"
                    type="email"
                    className="input"
                    autoComplete="email"
                    aria-invalid={errors.email ? 'true' : 'false'}
                    {...register('email')}
                  />
                  {errors.email ? (
                    <p className="field-error" role="alert">
                      <AlertCircle size={12} /> {errors.email.message}
                    </p>
                  ) : (
                    <p className="field-help">
                      A esta dirección llegará la invitación para crear la contraseña.
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              <label htmlFor="usu-rol" className="label">
                Rol *
              </label>
              <select
                id="usu-rol"
                className="select"
                aria-invalid={errors.rol ? 'true' : 'false'}
                {...register('rol')}
              >
                {ROLES_VALIDOS.map((r) => (
                  <option key={r} value={r}>
                    {metaEstado(ROL, r).label}
                  </option>
                ))}
              </select>
              {errors.rol ? (
                <p className="field-error" role="alert">
                  <AlertCircle size={12} /> {errors.rol.message}
                </p>
              ) : (
                <p className="field-help">
                  {{
                    administrador:
                      'Acceso completo: configuración, reportes, liquidaciones y usuarios.',
                    recepcionista: 'Cobra servicios, registra clientes y usa el POS.',
                    cajero: 'Cobra, maneja la caja y las cuentas por cobrar.',
                    colaborador:
                      'Solo el portal: registra sus servicios y ve sus comisiones y metas.',
                  }[rol as string] ?? ''}
                </p>
              )}

              {rol === 'colaborador' && (
                <div className="mt-3">
                  <label htmlFor="usu-ficha" className="label">
                    Ficha de colaborador {usuario ? '' : '*'}
                  </label>
                  {usuario ? (
                    <p className="text-body-sm text-text-secondary">
                      {usuario.colaboradorId
                        ? `Vinculado a ${
                            fichas.data?.data.find((c) => c.id === usuario.colaboradorId)?.nombre ??
                            `la ficha #${usuario.colaboradorId}`
                          }.`
                        : 'Sin ficha vinculada: no podrá registrar servicios en el portal.'}
                    </p>
                  ) : (
                    <>
                      <select
                        id="usu-ficha"
                        className="select"
                        value={fichaId}
                        onChange={(e) => setFichaId(e.target.value)}
                      >
                        <option value="">Elige la persona…</option>
                        {(fichas.data?.data ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                            {c.area ? ` · ${c.area}` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="field-help">
                        Así el portal sabe qué servicios y comisiones son suyos. Si no aparece,
                        créala primero en Colaboradores.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {isEdit ? (
              <div className="flex items-center gap-2">
                <input
                  id="usu-activo"
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-accent-from)]"
                  {...register('activo')}
                />
                <label htmlFor="usu-activo" className="text-body-sm text-text-secondary">
                  Activo (puede iniciar sesión y usar el sistema)
                </label>
              </div>
            ) : (
              <p className="field-help">
                <UserPlus size={12} className="mr-1 inline" /> La cuenta se crea activa; podrás
                desactivarla después desde la lista.
              </p>
            )}
          </div>

          <footer className="drawer-footer">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Enviar invitación'}
            </button>
          </footer>
        </form>
      </div>
    </>
  );
};

// ============================================================================
// Confirmación de desactivación (modal: sólo para confirmar)
// ============================================================================
const ConfirmarDesactivar: React.FC<{
  usuario: Usuario;
  procesando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}> = ({ usuario, procesando, onCancelar, onConfirmar }) => {
  useCerrarConEsc(onCancelar);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="drawer-backdrop" onClick={onCancelar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desactivar-usuario-titulo"
        className="panel relative z-[41] w-full max-w-sm p-6"
      >
        <h2 id="desactivar-usuario-titulo" className="text-h2 text-text-primary">
          ¿Desactivar a {usuario.nombre}?
        </h2>
        <p className="mt-2 text-body-sm text-text-secondary">
          No podrá iniciar sesión, pero su historial se conserva y puedes reactivarlo editándolo.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="btn-ghost">
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar} disabled={procesando} className="btn-danger">
            {procesando ? 'Desactivando…' : 'Desactivar'}
          </button>
        </div>
      </div>
    </div>
  );
};

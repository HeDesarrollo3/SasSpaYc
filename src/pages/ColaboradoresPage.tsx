// src/pages/ColaboradoresPage.tsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Users, Pencil, Power, AlertCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearColaboradorSchema,
  type CrearColaboradorInput,
  type Colaborador,
} from '../types/colaborador.types';
import {
  useColaboradoresList,
  useCrearColaborador,
  useActualizarColaborador,
  useDesactivarColaborador,
} from '../hooks/useColaboradores';
import { friendlyError } from '../utils/error-messages';

// ============================================================================
// Página principal
// ============================================================================
export const ColaboradoresPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState<Colaborador | null>(null);
  const [formVisible, setFormVisible] = useState(false);

  const { data, isLoading, isFetching, error } = useColaboradoresList({
    page,
    limit: 20,
    q: q || undefined,
    sort: '-created_at',
  });

  const desactivar = useDesactivarColaborador();

  const handleDesactivar = (col: Colaborador) => {
    if (!window.confirm(`¿Desactivar a ${col.nombre}?`)) return;
    desactivar.mutate(col.id, {
      onSuccess: () => toast.success('Colaborador desactivado'),
      onError: (err) => toast.error(friendlyError(err)),
    });
  };

  const openCrear = () => {
    setEditando(null);
    setFormVisible(true);
  };


  const dataFiltrada = (data?.data ?? []).filter((c) =>
  q ? c.nombre.toLowerCase().includes(q.toLowerCase()) : true,
);
  const openEditar = (col: Colaborador) => {
    setEditando(col);
    setFormVisible(true);
  };

  return (
    <div className="space-y-6">
      <Header onCrear={openCrear} />

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-xs text-danger flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{friendlyError(error)}</span>
        </div>
      )}

      <Filtros value={q} onChange={setQ} />

      <div className="glass-card overflow-hidden rounded-md">
        <TablaColaboradores
          data={data?.data ?? []}
          loading={isLoading}
          isFetching={isFetching}
          onEdit={openEditar}
          onDelete={handleDesactivar}
        />
        {data?.meta && (
          <Paginador
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            onChange={setPage}
          />
        )}
      </div>

      {formVisible && (
        <ColaboradorModal
          key={editando?.id ?? 'nuevo'}
          colaborador={editando}
          onClose={() => setFormVisible(false)}
        />
      )}
    </div>
  );
};

// ============================================================================
// Sub-componentes
// ============================================================================
const Header: React.FC<{ onCrear: () => void }> = ({ onCrear }) => (
  <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div>
      <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
        <Users size={24} className="text-accent-from" /> Colaboradores
      </h1>
      <p className="mt-1 text-xs text-text-secondary">
        Gestión de personal, comisiones y liquidaciones.
      </p>
    </div>
    <button onClick={onCrear} className="btn-primary flex items-center gap-2 text-sm">
      <Plus size={16} /> Nuevo colaborador
    </button>
  </header>
);

const Filtros: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange,
}) => (
  <div className="relative max-w-sm">
    <Search size={16} className="absolute left-3 top-3 text-text-muted" />
    <input
      type="search"
      placeholder="Buscar por nombre o área…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-surface-card border border-border-subtle rounded-sm py-2 pl-10 pr-3 text-sm text-text-primary focus:border-border-strong transition-colors"
    />
  </div>
);

const TablaColaboradores: React.FC<{
  data: Colaborador[];
  loading: boolean;
  isFetching: boolean;
  onEdit: (c: Colaborador) => void;
  onDelete: (c: Colaborador) => void;
}> = ({ data, loading, isFetching, onEdit, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-bg-elevated/50 border-b border-border-subtle text-[11px] text-text-muted">
          <th className="p-4 font-semibold">Nombre</th>
          <th className="p-4 font-semibold">Teléfono</th>
          <th className="p-4 font-semibold">Área</th>
          <th className="p-4 font-semibold">Comisión</th>
          <th className="p-4 font-semibold text-center">Estado</th>
          <th className="p-4 font-semibold text-right">Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle text-sm text-text-primary">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td colSpan={6} className="p-4">
                <div className="skeleton h-4 w-full" />
              </td>
            </tr>
          ))}

        {!loading &&
          data.map((c) => (
            <tr key={c.id} className="hover:bg-bg-elevated/30 transition-colors">
              <td className="p-4 font-medium">{c.nombre}</td>
              <td className="p-4 text-text-secondary">{c.telefono ?? '—'}</td>
              <td className="p-4 text-text-secondary">{c.area ?? '—'}</td>
              <td className="p-4">
                {c.porcentajeComision !== null ? (
                  <span className="bg-accent-from/10 text-accent-from px-2 py-1 rounded-sm text-xs font-semibold">
                    {c.porcentajeComision}%
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td className="p-4 text-center">
                {c.activo ? (
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
                    onClick={() => onEdit(c)}
                    className="p-2 rounded-sm border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
                    aria-label={`Editar ${c.nombre}`}
                  >
                    <Pencil size={14} />
                  </button>
                  {c.activo && (
                    <button
                      onClick={() => onDelete(c)}
                      className="p-2 rounded-sm border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                      aria-label={`Desactivar ${c.nombre}`}
                    >
                      <Power size={14} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}

        {!loading && data.length === 0 && (
          <tr>
            <td colSpan={6} className="p-8 text-center text-text-muted text-xs">
              No hay colaboradores registrados.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const Paginador: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  onChange: (p: number) => void;
}> = ({ page, totalPages, total, onChange }) => (
  <div className="flex items-center justify-between p-4 border-t border-border-subtle text-xs text-text-secondary">
    <span>
      Página {page} de {totalPages} · {total} registros
    </span>
    <div className="flex gap-2">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-3 py-1 rounded-sm border border-border-subtle hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Anterior
      </button>
      <button
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="px-3 py-1 rounded-sm border border-border-subtle hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Siguiente
      </button>
    </div>
  </div>
);

// ============================================================================
// Modal de crear / editar
// ============================================================================
const ColaboradorModal: React.FC<{
  colaborador: Colaborador | null;
  onClose: () => void;
}> = ({ colaborador, onClose }) => {
  const isEdit = !!colaborador;
  const crear = useCrearColaborador();
  const actualizar = useActualizarColaborador();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CrearColaboradorInput>({
    resolver: zodResolver(crearColaboradorSchema),
    defaultValues: colaborador
      ? {
          nombre: colaborador.nombre,
          telefono: colaborador.telefono ?? '',
          porcentajeComision: colaborador.porcentajeComision ?? 0,
          area: colaborador.area ?? '',
          fechaIngreso: colaborador.fechaIngreso ?? '',
          notas: colaborador.notas ?? '',
          activo: colaborador.activo,
        }
      : { porcentajeComision: 50, activo: true },
  });

  const onSubmit = async (input: CrearColaboradorInput) => {
    try {
      if (isEdit) {
        await actualizar.mutateAsync({ id: colaborador!.id, input });
        toast.success('Colaborador actualizado');
      } else {
        await crear.mutateAsync(input);
        toast.success('Colaborador creado');
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
      <div className="glass-card w-full max-w-2xl p-6 rounded-lg">
        <header className="mb-4">
          <h2 className="text-lg font-bold text-text-primary">
            {isEdit ? 'Editar colaborador' : 'Nuevo colaborador'}
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            {isEdit ? 'Modifica los datos y guarda.' : 'Completa los datos del nuevo colaborador.'}
          </p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre completo" error={errors.nombre?.message}>
            <input
              {...register('nombre')}
              className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-border-strong"
            />
          </Field>

          <Field label="Teléfono" error={errors.telefono?.message}>
            <input
              {...register('telefono')}
              className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-border-strong"
            />
          </Field>

          <Field label="Área" error={errors.area?.message}>
            <input
              {...register('area')}
              className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-border-strong"
            />
          </Field>

          <Field label="Comisión (%)" error={errors.porcentajeComision?.message}>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              {...register('porcentajeComision', { valueAsNumber: true })}
              className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-border-strong"
            />
          </Field>

          <Field label="Fecha de ingreso" error={errors.fechaIngreso?.message}>
            <input
              type="date"
              {...register('fechaIngreso')}
              className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-border-strong"
            />
          </Field>

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

          <div className="sm:col-span-2">
            <Field label="Notas" error={errors.notas?.message}>
              <textarea
                {...register('notas')}
                rows={3}
                className="w-full bg-surface-card border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-border-strong resize-none"
              />
            </Field>
          </div>

          <footer className="sm:col-span-2 flex justify-end gap-2 pt-2">
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

// Field helper (label + error bajo el input, Design System §7)
const Field: React.FC<{
  label: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, error, children }) => (
  <div>
    <label className="block text-xs font-semibold text-text-primary mb-1">{label}</label>
    {children}
    {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
  </div>
);
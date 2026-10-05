// src/pages/ColaboradoresPage.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  Ban,
  CalendarDays,
  CheckCircle2,
  Pencil,
  Percent,
  Phone,
  Plus,
  Power,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  crearColaboradorSchema,
  type Colaborador,
  type ColaboradorFormInput,
  type ColaboradorFormOutput,
} from '../types/colaborador.types';
import {
  useActualizarColaborador,
  useColaboradoresList,
  useCrearColaborador,
  useDesactivarColaborador,
} from '../hooks/useColaboradores';
import { friendlyError } from '../utils/error-messages';
import { formatFecha, formatMoney, formatNumero, formatPorcentaje, iniciales } from '../lib/format';
import { esAreaCabello, finPruebaPorDefecto } from '../types/colaborador.types';
import { claseBadge } from '../lib/estados';
import { PageHeader } from '../components/PageHeader';

const LIMIT = 12;

type FiltroEstado = 'activos' | 'inactivos' | 'todos';

/** Colores del avatar, elegidos de forma estable por `id` (evita `style` inline). */
const AVATAR_COLORES = [
  'bg-accent-from/15 text-accent-from border-accent-from/30',
  'bg-accent-to/15 text-accent-to border-accent-to/30',
  'bg-info/15 text-info border-info/30',
  'bg-success/15 text-success border-success/30',
  'bg-warning/15 text-warning border-warning/30',
] as const;

const colorAvatar = (id: number) => AVATAR_COLORES[id % AVATAR_COLORES.length];

/** Retrasa un valor: la API no debe recibir una petición por cada tecla. */
function useDebounce<T>(valor: T, ms = 300): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return debounced;
}

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
export const ColaboradoresPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const q = useDebounce(busqueda, 300);
  const [estado, setEstado] = useState<FiltroEstado>('activos');
  const [formVisible, setFormVisible] = useState(false);
  const [editando, setEditando] = useState<Colaborador | null>(null);
  const [aDesactivar, setADesactivar] = useState<Colaborador | null>(null);

  // Cualquier cambio de filtro vuelve a la página 1: si no, se pide una página
  // que ya no existe para el filtro nuevo y la lista sale vacía.
  // Se hace en el propio evento (no en un `useEffect`) para no provocar un
  // segundo render en cascada.
  const cambiarBusqueda = useCallback((v: string) => {
    setBusqueda(v);
    setPage(1);
  }, []);
  const cambiarEstado = useCallback((v: FiltroEstado) => {
    setEstado(v);
    setPage(1);
  }, []);

  const { data, isLoading, isFetching, error } = useColaboradoresList({
    page,
    limit: LIMIT,
    q: q.trim() || undefined,
    activo: estado === 'todos' ? undefined : estado === 'activos',
    sort: '-created_at',
  });

  const desactivar = useDesactivarColaborador();

  const colaboradores = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;

  const abrirCrear = useCallback(() => {
    setEditando(null);
    setFormVisible(true);
  }, []);
  const abrirEditar = useCallback((c: Colaborador) => {
    setEditando(c);
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
        titulo="Colaboradores"
        descripcion={
          <>
            {formatNumero(total)}{' '}
            {total === 1 ? 'colaborador registrado' : 'colaboradores registrados'}
            {' · '}personal, comisiones y liquidaciones.
          </>
        }
        icono={Users}
        acciones={
          <button type="button" onClick={abrirCrear} className="btn-primary">
            <Plus size={16} /> Nuevo colaborador
          </button>
        }
      />

      {error && (
        <div className="banner banner-danger" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{friendlyError(error)}</span>
        </div>
      )}

      <Filtros
        busqueda={busqueda}
        onBuscar={cambiarBusqueda}
        estado={estado}
        onEstado={cambiarEstado}
        total={total}
        actualizando={isFetching && !isLoading}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-2/3" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </div>
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : colaboradores.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center">
          <Users size={28} className="text-text-muted" />
          <p className="text-body font-semibold text-text-primary">
            No hay colaboradores que coincidan con el filtro.
          </p>
          <p className="max-w-md text-body-sm text-text-secondary">
            Ajusta la búsqueda o el estado. Si el spa acaba de empezar, crea el primer colaborador
            para poder asignarle servicios y comisiones.
          </p>
          <button type="button" onClick={abrirCrear} className="btn-secondary mt-1">
            <Plus size={14} /> Nuevo colaborador
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {colaboradores.map((c) => (
            <li key={c.id} className="panel flex flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-body font-semibold ${colorAvatar(c.id)}`}
                >
                  {iniciales(c.nombre)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-body leading-snug font-semibold text-text-primary">
                    {c.nombre}
                  </h2>
                  <p className="line-clamp-2 text-body-sm text-text-secondary capitalize-first">
                    {c.area || 'Sin área'}
                  </p>
                </div>
                <span className={claseBadge(c.activo ? 'success' : 'neutral')}>
                  {c.activo ? <CheckCircle2 size={12} /> : <Ban size={12} />}
                  {c.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {c.porcentajeComision !== null ? (
                  <span className={claseBadge('accent')}>
                    <Percent size={12} />
                    {formatPorcentaje(c.porcentajeComision)}
                  </span>
                ) : (
                  <span className={claseBadge('neutral')}>Sin comisión</span>
                )}
                {c.pruebaHasta && c.pruebaHasta >= new Date().toISOString().slice(0, 10) && (
                  <span className={claseBadge('warning')}>
                    En prueba hasta {formatFecha(c.pruebaHasta)}
                  </span>
                )}
                {c.porcentajeReferido !== null && (
                  <span className={claseBadge('info')}>
                    Referidos {formatPorcentaje(c.porcentajeReferido)}
                  </span>
                )}
              </div>

              <dl className="space-y-1.5 text-body-sm text-text-secondary">
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Teléfono</dt>
                  <Phone size={12} className="text-text-muted" />
                  <dd className="truncate">{c.telefono || 'Sin teléfono'}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Fecha de ingreso</dt>
                  <CalendarDays size={12} className="text-text-muted" />
                  <dd>
                    {c.fechaIngreso
                      ? `Ingresó el ${formatFecha(c.fechaIngreso)}`
                      : 'Sin fecha de ingreso'}
                  </dd>
                </div>
              </dl>

              <div className="mt-auto flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
                <button type="button" onClick={() => abrirEditar(c)} className="btn-secondary">
                  <Pencil size={13} /> Editar
                </button>
                {c.activo && (
                  <button
                    type="button"
                    onClick={() => setADesactivar(c)}
                    className="btn-ghost"
                    aria-label={`Desactivar a ${c.nombre}`}
                  >
                    {/* El color va en el ícono: `.btn-ghost` es CSS sin capa y gana
                        a `text-danger` de Tailwind (`@layer utilities`). */}
                    <Power size={13} className="text-danger" /> Desactivar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && data && (
        <Paginador page={page} totalPages={totalPages} total={total} onChange={setPage} />
      )}

      {formVisible && (
        <ColaboradorDrawer
          key={editando?.id ?? 'nuevo'}
          colaborador={editando}
          onClose={cerrarForm}
        />
      )}

      {aDesactivar && (
        <ConfirmarDesactivar
          colaborador={aDesactivar}
          procesando={desactivar.isPending}
          onCancelar={cancelarDesactivar}
          onConfirmar={confirmarDesactivar}
        />
      )}
    </div>
  );
};

// ============================================================================
// Sub-componentes
// ============================================================================
const Filtros: React.FC<{
  busqueda: string;
  onBuscar: (v: string) => void;
  estado: FiltroEstado;
  onEstado: (v: FiltroEstado) => void;
  total: number;
  actualizando: boolean;
}> = ({ busqueda, onBuscar, estado, onEstado, total, actualizando }) => (
  <div className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
    <div className="flex-1">
      <label htmlFor="filtro-q" className="label">
        <Search size={12} className="mr-1 inline" /> Buscar por nombre
      </label>
      <input
        id="filtro-q"
        type="search"
        className="input"
        placeholder="Ej. Ana"
        value={busqueda}
        onChange={(e) => onBuscar(e.target.value)}
      />
    </div>

    <div className="sm:w-52">
      <label htmlFor="filtro-estado" className="label">
        Estado
      </label>
      <select
        id="filtro-estado"
        className="select"
        value={estado}
        onChange={(e) => onEstado(e.target.value as FiltroEstado)}
      >
        <option value="activos">Sólo activos</option>
        <option value="inactivos">Sólo inactivos</option>
        <option value="todos">Todos</option>
      </select>
    </div>

    <p className="flex items-center gap-1 text-body-sm text-text-muted sm:w-36 sm:justify-end">
      {actualizando ? (
        <>
          <RefreshCw size={12} className="animate-spin" /> Actualizando…
        </>
      ) : (
        `${formatNumero(total)} en total`
      )}
    </p>
  </div>
);

const Paginador: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  onChange: (p: number) => void;
}> = ({ page, totalPages, total, onChange }) => (
  <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
    <p className="text-body-sm text-text-secondary">
      Página {formatNumero(page)} de {formatNumero(totalPages)} · {formatNumero(total)}{' '}
      {total === 1 ? 'registro' : 'registros'}
    </p>
    <div className="flex gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="btn-secondary"
      >
        Anterior
      </button>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="btn-secondary"
      >
        Siguiente
      </button>
    </div>
  </div>
);

// ============================================================================
// Drawer de crear / editar
// ============================================================================
const ColaboradorDrawer: React.FC<{
  colaborador: Colaborador | null;
  onClose: () => void;
}> = ({ colaborador, onClose }) => {
  const isEdit = !!colaborador;
  const crear = useCrearColaborador();
  const actualizar = useActualizarColaborador();

  useCerrarConEsc(onClose);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ColaboradorFormInput, unknown, ColaboradorFormOutput>({
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
          enPrueba: colaborador.pruebaHasta !== null,
          pruebaHasta: colaborador.pruebaHasta ?? '',
          sueldoPrueba:
            colaborador.sueldoPruebaMensual !== null ? String(colaborador.sueldoPruebaMensual) : '',
          porcentajeReferido:
            colaborador.porcentajeReferido !== null ? String(colaborador.porcentajeReferido) : '',
        }
      : {
          nombre: '',
          telefono: '',
          porcentajeComision: 50,
          area: '',
          fechaIngreso: '',
          notas: '',
          activo: true,
          // Quien entra empieza en prueba (1 mes, sueldo fijo, sin comisión).
          enPrueba: true,
          pruebaHasta: '',
          sueldoPrueba: '',
          porcentajeReferido: '',
        },
  });

  const areaActual = useWatch({ control, name: 'area' });
  const enPrueba = useWatch({ control, name: 'enPrueba' });
  const fechaIngresoActual = useWatch({ control, name: 'fechaIngreso' });
  const sueldoActual = useWatch({ control, name: 'sueldoPrueba' });
  const sueldoMensual = Number((sueldoActual ?? '').replace(/[^\d]/g, '')) || 1_500_000;

  const onSubmit = async (input: ColaboradorFormOutput) => {
    try {
      if (colaborador) {
        await actualizar.mutateAsync({ id: colaborador.id, input });
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
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="colaborador-drawer-titulo"
      >
        <header className="drawer-header">
          <div>
            <h2 id="colaborador-drawer-titulo" className="text-h2 text-text-primary">
              {isEdit ? 'Editar colaborador' : 'Nuevo colaborador'}
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              {isEdit
                ? 'Modifica los datos y guarda los cambios.'
                : 'Completa los datos del nuevo colaborador.'}
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

        <form
          id="colaborador-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="drawer-body space-y-4">
            <div>
              <label htmlFor="col-nombre" className="label">
                Nombre completo *
              </label>
              <input
                id="col-nombre"
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="col-telefono" className="label">
                  Teléfono
                </label>
                <input
                  id="col-telefono"
                  type="tel"
                  className="input"
                  autoComplete="tel"
                  aria-invalid={errors.telefono ? 'true' : 'false'}
                  {...register('telefono')}
                />
                {errors.telefono && (
                  <p className="field-error" role="alert">
                    <AlertCircle size={12} /> {errors.telefono.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="col-area" className="label">
                  Área
                </label>
                <input
                  id="col-area"
                  type="text"
                  className="input"
                  placeholder="Masajes, Facial, Recepción…"
                  aria-invalid={errors.area ? 'true' : 'false'}
                  {...register('area')}
                />
                {errors.area && (
                  <p className="field-error" role="alert">
                    <AlertCircle size={12} /> {errors.area.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="col-comision" className="label">
                  Comisión (%)
                </label>
                <input
                  id="col-comision"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  className="input"
                  aria-invalid={errors.porcentajeComision ? 'true' : 'false'}
                  {...register('porcentajeComision', { valueAsNumber: true })}
                />
                {errors.porcentajeComision ? (
                  <p className="field-error" role="alert">
                    <AlertCircle size={12} /> {errors.porcentajeComision.message}
                  </p>
                ) : (
                  <p className="field-help">Entre 0 y 100. Se aplica al liquidar sus servicios.</p>
                )}
              </div>

              <div>
                <label htmlFor="col-fecha" className="label">
                  Fecha de ingreso
                </label>
                <input
                  id="col-fecha"
                  type="date"
                  className="input"
                  aria-invalid={errors.fechaIngreso ? 'true' : 'false'}
                  {...register('fechaIngreso')}
                />
                {errors.fechaIngreso && (
                  <p className="field-error" role="alert">
                    <AlertCircle size={12} /> {errors.fechaIngreso.message}
                  </p>
                )}
              </div>
            </div>

            {/* ── Forma de pago (migración 023) ── */}
            <fieldset className="space-y-3 rounded-lg border border-border p-4">
              <legend className="px-1 text-body-sm font-semibold text-text-primary">
                Forma de pago
              </legend>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--color-accent-from)]"
                  {...register('enPrueba')}
                />
                <span className="text-body-sm text-text-primary">
                  En período de prueba: sueldo fijo, sin comisiones
                </span>
              </label>

              {enPrueba && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="col-prueba-hasta" className="label">
                      Prueba hasta
                    </label>
                    <input
                      id="col-prueba-hasta"
                      type="date"
                      className="input"
                      {...register('pruebaHasta')}
                    />
                    <p className="field-help">
                      Vacío = un mes desde el ingreso (
                      {formatFecha(finPruebaPorDefecto(fechaIngresoActual || null))}).
                    </p>
                  </div>
                  <div>
                    <label htmlFor="col-sueldo" className="label">
                      Sueldo mensual de prueba
                    </label>
                    <input
                      id="col-sueldo"
                      inputMode="numeric"
                      className="input tabular"
                      placeholder="1500000"
                      {...register('sueldoPrueba')}
                    />
                    <p className="field-help">
                      Se paga por semanas: {formatMoney(Math.round(sueldoMensual / 4))} cada una.
                      Vacío = el sueldo del parámetro (1.500.000).
                    </p>
                  </div>
                </div>
              )}

              {esAreaCabello(areaActual) && (
                <div>
                  <label htmlFor="col-referido" className="label">
                    Comisión por cliente referido (%)
                  </label>
                  <input
                    id="col-referido"
                    inputMode="decimal"
                    className="input"
                    placeholder="60"
                    aria-invalid={errors.porcentajeReferido ? 'true' : 'false'}
                    {...register('porcentajeReferido')}
                  />
                  {errors.porcentajeReferido ? (
                    <p className="field-error" role="alert">
                      <AlertCircle size={12} /> {errors.porcentajeReferido.message}
                    </p>
                  ) : (
                    <p className="field-help">
                      Se aplica cuando el cliente lo trajo ella o él (lo marca en su celular y
                      recepción lo confirma al cobrar). Vacío = 60 % (40 % para el spa). Los
                      clientes del spa siguen con la comisión normal. Vacío = sin comisión de
                      referido.
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            <div>
              <label htmlFor="col-notas" className="label">
                Notas
              </label>
              <textarea
                id="col-notas"
                rows={3}
                className="textarea"
                aria-invalid={errors.notas ? 'true' : 'false'}
                {...register('notas')}
              />
              {errors.notas && (
                <p className="field-error" role="alert">
                  <AlertCircle size={12} /> {errors.notas.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                id="col-activo"
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-accent-from)]"
                {...register('activo')}
              />
              <label htmlFor="col-activo" className="text-body-sm text-text-secondary">
                Activo (puede recibir servicios y genera comisiones)
              </label>
            </div>
          </div>

          <footer className="drawer-footer">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear colaborador'}
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
  colaborador: Colaborador;
  procesando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}> = ({ colaborador, procesando, onCancelar, onConfirmar }) => {
  useCerrarConEsc(onCancelar);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="drawer-backdrop" onClick={onCancelar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desactivar-titulo"
        className="panel relative z-[41] w-full max-w-sm p-6"
      >
        <h2 id="desactivar-titulo" className="text-h2 text-text-primary">
          ¿Desactivar a {colaborador.nombre}?
        </h2>
        <p className="mt-2 text-body-sm text-text-secondary">
          Dejará de aparecer en los listados de activos y no se le podrán asignar servicios nuevos.
          Su historial y sus comisiones se conservan, y puedes reactivarlo editándolo.
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

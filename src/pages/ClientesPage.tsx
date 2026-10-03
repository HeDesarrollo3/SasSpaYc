// src/pages/ClientesPage.tsx
//
// Clientes del spa: buscar, crear, editar y ver la ficha (cuánto gasta, cada
// cuánto viene, qué servicios toma y con quién). Lo normal es que los clientes
// se guarden al cobrar; aquí se consultan y se corrigen.
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cake, Pencil, Phone, Plus, Search, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '../components/PageHeader';
import { ClientesService, type Cliente, type DatosCliente } from '../services/clientes.service';
import { formatFecha, formatFechaHora, formatMoney, formatNumero } from '../lib/format';
import { friendlyError } from '../utils/error-messages';

function useDebounce<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/** «12 mar» a partir de `AAAA-MM-DD`. */
function cumple(fecha?: string | null) {
  if (!fecha) return null;
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(
    new Date(`${fecha.slice(0, 10)}T12:00:00`),
  );
}

// ── Formulario (alta / edición) ─────────────────────────────────────────────
function FormCliente({ cliente, onClose }: { cliente: Cliente | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [datos, setDatos] = useState<DatosCliente>({
    nombre: cliente?.nombre ?? '',
    telefono: cliente?.telefono ?? '',
    fecha_nacimiento: cliente?.fecha_nacimiento?.slice(0, 10) ?? '',
    email: cliente?.email ?? '',
    autoriza_datos: cliente?.autoriza_datos ?? false,
    notas: cliente?.notas ?? '',
  });

  const guardar = useMutation({
    mutationFn: () =>
      cliente ? ClientesService.actualizar(cliente.id, datos) : ClientesService.guardar(datos),
    onSuccess: () => {
      toast.success(cliente ? 'Cliente actualizado' : 'Cliente creado');
      qc.invalidateQueries({ queryKey: ['clientes'] });
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (datos.nombre.trim().length >= 2) guardar.mutate();
  };

  const campo = (k: keyof DatosCliente, v: string | boolean) => setDatos((d) => ({ ...d, [k]: v }));

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <form className="drawer-panel" role="dialog" aria-modal="true" onSubmit={enviar}>
        <header className="drawer-header">
          <h2 className="text-h2 text-text-primary">
            {cliente ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="drawer-body space-y-4">
          <div>
            <label htmlFor="cl-nombre" className="label">
              Nombre *
            </label>
            <input
              id="cl-nombre"
              className="input"
              value={datos.nombre}
              onChange={(e) => campo('nombre', e.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cl-tel" className="label">
                Teléfono
              </label>
              <input
                id="cl-tel"
                className="input tabular"
                inputMode="tel"
                value={datos.telefono}
                onChange={(e) => campo('telefono', e.target.value)}
              />
              <p className="field-help">Un teléfono = un cliente: no se repite.</p>
            </div>
            <div>
              <label htmlFor="cl-nac" className="label">
                Fecha de nacimiento
              </label>
              <input
                id="cl-nac"
                type="date"
                className="input"
                value={datos.fecha_nacimiento ?? ''}
                onChange={(e) => campo('fecha_nacimiento', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="cl-email" className="label">
              Correo (opcional)
            </label>
            <input
              id="cl-email"
              type="email"
              className="input"
              value={datos.email ?? ''}
              onChange={(e) => campo('email', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cl-notas" className="label">
              Notas
            </label>
            <textarea
              id="cl-notas"
              rows={3}
              className="textarea"
              placeholder="Alergias, preferencias…"
              value={datos.notas}
              onChange={(e) => campo('notas', e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 text-body-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent-from)]"
              checked={!!datos.autoriza_datos}
              onChange={(e) => campo('autoriza_datos', e.target.checked)}
            />
            <span>
              Autoriza el tratamiento de sus datos para avisos de citas, saludos y promociones (Ley
              1581 de 2012).
            </span>
          </label>
        </div>
        <footer className="drawer-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={datos.nombre.trim().length < 2 || guardar.isPending}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </form>
    </>
  );
}

// ── Ficha ────────────────────────────────────────────────────────────────────
function Ficha({
  id,
  onClose,
  onEditar,
}: {
  id: number;
  onClose: () => void;
  onEditar: (c: Cliente) => void;
}) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['clientes', 'ficha', id],
    queryFn: () => ClientesService.ficha(id),
  });
  const r = data?.resumen;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer-panel" role="dialog" aria-modal="true">
        <header className="drawer-header">
          <div className="min-w-0">
            <h2 className="truncate text-h2 text-text-primary">
              {data?.cliente.nombre ?? 'Cliente'}
            </h2>
            {data && (
              <p className="mt-1 flex flex-wrap gap-x-3 text-body-sm text-text-secondary">
                {data.cliente.telefono && (
                  <span className="inline-flex items-center gap-1">
                    <Phone size={13} aria-hidden="true" /> {data.cliente.telefono}
                  </span>
                )}
                {data.cliente.fecha_nacimiento && (
                  <span className="inline-flex items-center gap-1">
                    <Cake size={13} aria-hidden="true" /> {cumple(data.cliente.fecha_nacimiento)}
                  </span>
                )}
                {data.cliente.autoriza_datos && (
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck size={13} aria-hidden="true" /> Autorizó datos
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            {data && (
              <button
                type="button"
                className="btn-icon"
                aria-label="Editar cliente"
                onClick={() => onEditar(data.cliente)}
              >
                <Pencil size={16} />
              </button>
            )}
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="drawer-body space-y-5">
          {isPending && <div className="skeleton h-40" />}
          {isError && <div className="banner banner-danger">{friendlyError(error)}</div>}
          {data && r && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Visitas', formatNumero(r.visitas)],
                  ['Gasto total', formatMoney(r.gasto_total)],
                  ['Ticket promedio', formatMoney(r.ticket_promedio)],
                  [
                    'Viene cada',
                    r.dias_entre_visitas === null
                      ? '—'
                      : `${formatNumero(r.dias_entre_visitas)} días`,
                  ],
                  ['Primera visita', r.primera_visita ? formatFecha(r.primera_visita) : '—'],
                  ['Última visita', r.ultima_visita ? formatFecha(r.ultima_visita) : '—'],
                ].map(([t, v]) => (
                  <div key={t} className="rounded-md border border-border-subtle p-3">
                    <p className="text-xs text-text-muted">{t}</p>
                    <p className="tabular text-lg font-semibold text-text-primary">{v}</p>
                  </div>
                ))}
              </div>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-text-primary">Servicios que toma</h3>
                {data.servicios.length === 0 ? (
                  <p className="text-body-sm text-text-muted">Aún no tiene servicios cobrados.</p>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {data.servicios.map((s) => (
                      <li key={s.nombre} className="flex justify-between py-2 text-body-sm">
                        <span className="text-text-primary">{s.nombre}</span>
                        <span className="tabular text-text-secondary">
                          {formatNumero(s.veces)}× · {formatMoney(s.gasto)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {data.colaboradores.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-text-primary">La atienden</h3>
                  <p className="text-body-sm text-text-secondary">
                    {data.colaboradores
                      .map((c) => `${c.nombre} (${c.visitas} ${c.visitas === 1 ? 'vez' : 'veces'})`)
                      .join(' · ')}
                  </p>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold text-text-primary">Últimas visitas</h3>
                <ul className="space-y-2">
                  {data.ultimas_visitas.map((v) => (
                    <li
                      key={v.venta_id}
                      className="rounded-md border border-border-subtle p-3 text-body-sm"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-text-secondary">{formatFechaHora(v.fecha_hora)}</span>
                        <span className="tabular font-semibold text-text-primary">
                          {formatMoney(v.total)}
                        </span>
                      </div>
                      <p className="mt-1 text-text-primary">
                        {v.servicios.join(', ') || 'Venta'}
                        {v.colaborador ? (
                          <span className="text-text-muted"> · {v.colaborador}</span>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export const ClientesPage: React.FC = () => {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const qDeb = useDebounce(q);
  const [editando, setEditando] = useState<Cliente | null | undefined>(undefined);
  const [fichaId, setFichaId] = useState<number | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['clientes', 'lista', qDeb, page],
    queryFn: () => ClientesService.buscar(qDeb, page, 20),
    placeholderData: (prev) => prev,
  });
  const filas = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="page-container space-y-6">
      <PageHeader
        titulo="Clientes"
        descripcion="Lo normal es guardarlos al cobrar. Aquí los buscas, corriges sus datos y ves cuánto gastan, cada cuánto vienen y qué servicios toman."
        icono={Users}
        acciones={
          <button type="button" className="btn-primary text-sm" onClick={() => setEditando(null)}>
            <Plus size={16} aria-hidden="true" /> Nuevo cliente
          </button>
        }
      />

      <div className="panel p-3">
        <label htmlFor="buscar-cliente" className="sr-only">
          Buscar cliente
        </label>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            id="buscar-cliente"
            type="search"
            className="input pl-9"
            placeholder="Nombre o teléfono…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isError && <div className="banner banner-danger">{friendlyError(error)}</div>}

      {isPending && !data ? (
        <div className="skeleton h-40" />
      ) : filas.length === 0 ? (
        <div className="panel p-6 text-center text-body-sm text-text-muted">
          {q ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes guardados.'}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setFichaId(c.id)}
                className="panel flex w-full items-start gap-3 p-4 text-left transition-colors hover:border-border-strong"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-from">
                  <UserRound size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-text-primary">{c.nombre}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-text-secondary">
                    <span className="tabular">{c.telefono || 'Sin teléfono'}</span>
                    {c.fecha_nacimiento && (
                      <span className="inline-flex items-center gap-1">
                        <Cake size={12} aria-hidden="true" /> {cumple(c.fecha_nacimiento)}
                      </span>
                    )}
                  </span>
                </span>
                {c.autoriza_datos && (
                  <span title="Autorizó el tratamiento de datos" className="text-success">
                    <ShieldCheck size={16} aria-label="Autorizó datos" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-body-sm text-text-secondary">
          <span>
            Página {meta.page} de {meta.totalPages} · {formatNumero(meta.total)} clientes
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {editando !== undefined && (
        <FormCliente cliente={editando} onClose={() => setEditando(undefined)} />
      )}
      {fichaId !== null && editando === undefined && (
        <Ficha id={fichaId} onClose={() => setFichaId(null)} onEditar={(c) => setEditando(c)} />
      )}
    </div>
  );
};

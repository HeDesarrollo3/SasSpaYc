// src/pages/CombosPage.tsx
//
// «Combos y promociones» (migración 027). Se fijan al inicio de cada mes.
//   · COMBO: varios servicios por un precio fijo. Cada servicio lleva SU parte
//     del precio y el colaborador que lo hace comisiona sobre esa parte
//     (p. ej. $120.000 = cabello $80.000 + uñas $20.000 + cejas $20.000).
//   · PROMOCIÓN: un servicio, varias veces, por un precio fijo (p. ej. 2x1).
// El colaborador elige el combo al registrar su servicio en el portal.
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Copy, Gift, Pencil, Plus, Power, Scale, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '../components/PageHeader';
import {
  CombosService,
  type Combo,
  type EstadoCombo,
  type GuardarCombo,
  type TipoCombo,
} from '../services/combos.service';
import { CatalogoService, type ItemCatalogo } from '../services/catalog.service';
import { formatFecha, formatMoney } from '../lib/format';
import { friendlyError } from '../utils/error-messages';

const KEY = ['combos', 'gestion'];

// ── Fechas (Colombia) ────────────────────────────────────────────────────────
function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}
/** Primer y último día del mes de `fecha` (+ `desplazar` meses). */
function mesDe(fecha: string, desplazar = 0): { inicio: string; fin: string } {
  const [a, m] = fecha.split('-').map(Number);
  const primero = new Date(Date.UTC(a, m - 1 + desplazar, 1));
  const ultimo = new Date(Date.UTC(a, m + desplazar, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: iso(primero), fin: iso(ultimo) };
}
function nombreMes(fecha: string) {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(
    new Date(`${fecha}T12:00:00`),
  );
}

/** «1.250.000» → 1250000. */
function aEntero(texto: string): number {
  return Number(texto.replace(/[^\d]/g, '')) || 0;
}
const miles = (n: number) => (n ? n.toLocaleString('es-CO') : '');

const ESTADOS: { valor: EstadoCombo | 'todos'; etiqueta: string }[] = [
  { valor: 'vigente', etiqueta: 'Vigentes' },
  { valor: 'programado', etiqueta: 'Programados' },
  { valor: 'vencido', etiqueta: 'Vencidos' },
  { valor: 'inactivo', etiqueta: 'Inactivos' },
  { valor: 'todos', etiqueta: 'Todos' },
];

const BADGE_ESTADO: Record<EstadoCombo, string> = {
  vigente: 'badge badge-success',
  programado: 'badge badge-info',
  vencido: 'badge',
  inactivo: 'badge badge-warning',
};

// ── Formulario ──────────────────────────────────────────────────────────────
type LineaForm = { clave: number; servicio_id: number | null; cantidad: number; parte: number };

function FormCombo({
  combo,
  tipoInicial,
  copiarAlMes,
  servicios,
  onClose,
}: {
  combo: Combo | null;
  tipoInicial: TipoCombo;
  /** Copiar `combo` como nuevo, con la vigencia del mes siguiente a la suya. */
  copiarAlMes?: boolean;
  servicios: ItemCatalogo[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editando = combo !== null && !copiarAlMes;
  const mes = copiarAlMes && combo ? mesDe(combo.fecha_inicio, 1) : mesDe(hoyBogota());

  const [tipo, setTipo] = useState<TipoCombo>(combo?.tipo ?? tipoInicial);
  const [nombre, setNombre] = useState(combo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(combo?.descripcion ?? '');
  const [inicio, setInicio] = useState(editando ? combo!.fecha_inicio : mes.inicio);
  const [fin, setFin] = useState(editando ? combo!.fecha_fin : mes.fin);
  const [precio, setPrecio] = useState(combo?.precio ?? 0);
  const [lineas, setLineas] = useState<LineaForm[]>(
    combo?.detalles.map((d, i) => ({
      clave: i,
      servicio_id: d.servicio_id,
      cantidad: d.cantidad,
      parte: d.precio_referencial,
    })) ??
      (tipoInicial === 'PROMOCION'
        ? [{ clave: 0, servicio_id: null, cantidad: 2, parte: 0 }]
        : [
            { clave: 0, servicio_id: null, cantidad: 1, parte: 0 },
            { clave: 1, servicio_id: null, cantidad: 1, parte: 0 },
          ]),
  );

  const porId = useMemo(() => new Map(servicios.map((s) => [s.id, s])), [servicios]);
  const porCategoria = useMemo(() => {
    const m = new Map<string, ItemCatalogo[]>();
    for (const s of servicios) {
      const c = s.categoria?.trim() || 'Sin categoría';
      m.set(c, [...(m.get(c) ?? []), s]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [servicios]);

  const esPromo = tipo === 'PROMOCION';
  // En una promoción hay una sola línea y su parte es el precio entero.
  const lineasEfectivas = esPromo
    ? lineas.slice(0, 1).map((l) => ({ ...l, parte: precio }))
    : lineas;
  const suma = lineasEfectivas.reduce((a, l) => a + l.parte, 0);
  const normal = lineasEfectivas.reduce(
    (a, l) => a + Number(porId.get(l.servicio_id ?? -1)?.precio ?? 0) * l.cantidad,
    0,
  );
  const cuadra = Math.abs(suma - precio) < 1;
  const ids = lineasEfectivas.map((l) => l.servicio_id).filter(Boolean);
  const repetidos = new Set(ids).size !== ids.length;
  const completo =
    nombre.trim().length >= 2 &&
    precio > 0 &&
    inicio &&
    fin &&
    fin >= inicio &&
    lineasEfectivas.length >= (esPromo ? 1 : 2) &&
    lineasEfectivas.every((l) => l.servicio_id && l.cantidad >= 1) &&
    !repetidos &&
    cuadra;

  const cambiarLinea = (clave: number, cambio: Partial<LineaForm>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));

  /** Reparte el precio en proporción al precio normal de cada servicio (redondeo a mil). */
  const repartir = () => {
    const pesos = lineas.map(
      (l) => Number(porId.get(l.servicio_id ?? -1)?.precio ?? 0) * l.cantidad,
    );
    const total = pesos.reduce((a, b) => a + b, 0);
    if (!precio || !total) {
      toast.error('Elige los servicios y escribe el precio del combo primero.');
      return;
    }
    const partes = pesos.map((p) => Math.round((precio * p) / total / 1000) * 1000);
    const resto = precio - partes.reduce((a, b) => a + b, 0);
    const mayor = pesos.indexOf(Math.max(...pesos));
    partes[mayor] += resto;
    setLineas((ls) => ls.map((l, i) => ({ ...l, parte: partes[i] })));
  };

  const guardar = useMutation({
    mutationFn: () => {
      const dto: GuardarCombo = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        tipo,
        precio,
        fecha_inicio: inicio,
        fecha_fin: fin,
        activo: editando ? combo!.activo : true,
        detalles: lineasEfectivas.map((l) => ({
          servicio_id: l.servicio_id!,
          cantidad: l.cantidad,
          precio_referencial: l.parte,
        })),
      };
      return editando ? CombosService.actualizar(combo!.id, dto) : CombosService.crear(dto);
    },
    onSuccess: () => {
      toast.success(editando ? 'Cambios guardados' : esPromo ? 'Promoción creada' : 'Combo creado');
      qc.invalidateQueries({ queryKey: ['combos'] });
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (completo) guardar.mutate();
  };

  const titulo = editando
    ? `Editar ${esPromo ? 'promoción' : 'combo'}`
    : copiarAlMes
      ? `Copiar a ${nombreMes(mes.inicio)}`
      : esPromo
        ? 'Nueva promoción'
        : 'Nuevo combo';

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <form className="drawer-panel" role="dialog" aria-modal="true" onSubmit={enviar}>
        <header className="drawer-header">
          <h2 className="text-h2 text-text-primary">{titulo}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-body space-y-5">
          <fieldset>
            <legend className="label">Tipo</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['COMBO', 'Combo', 'Varios servicios, un precio'],
                  ['PROMOCION', 'Promoción', 'Ej.: 2x1 en un servicio'],
                ] as const
              ).map(([valor, etiqueta, ayuda]) => (
                <label
                  key={valor}
                  className={`cursor-pointer rounded-md border p-3 text-sm ${
                    tipo === valor
                      ? 'border-accent-from bg-accent-soft'
                      : 'border-border-subtle hover:border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name="tipo-combo"
                    className="sr-only"
                    checked={tipo === valor}
                    onChange={() => {
                      setTipo(valor);
                      if (valor === 'PROMOCION')
                        setLineas((ls) => [
                          { ...ls[0], cantidad: Math.max(2, ls[0]?.cantidad ?? 2) },
                        ]);
                      else if (lineas.length < 2)
                        setLineas((ls) => [
                          { ...ls[0], cantidad: 1 },
                          { clave: Date.now(), servicio_id: null, cantidad: 1, parte: 0 },
                        ]);
                    }}
                  />
                  <span className="block font-semibold text-text-primary">{etiqueta}</span>
                  <span className="text-xs text-text-secondary">{ayuda}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="cb-nombre" className="label">
              Nombre *
            </label>
            <input
              id="cb-nombre"
              className="input"
              placeholder={esPromo ? '2x1 en manicura' : 'Combo Reina: cabello + uñas + cejas'}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cb-ini" className="label">
                Desde
              </label>
              <input
                id="cb-ini"
                type="date"
                className="input"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cb-fin" className="label">
                Hasta
              </label>
              <input
                id="cb-fin"
                type="date"
                className="input"
                value={fin}
                min={inicio}
                onChange={(e) => setFin(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cb-precio" className="label">
              Precio que paga el cliente *
            </label>
            <input
              id="cb-precio"
              className="input tabular"
              inputMode="numeric"
              placeholder={esPromo ? '50.000' : '120.000'}
              value={miles(precio)}
              onChange={(e) => setPrecio(aEntero(e.target.value))}
            />
            {normal > 0 && (
              <p className="field-help">
                Precio normal {formatMoney(normal)}
                {normal > precio && precio > 0
                  ? ` · el cliente ahorra ${formatMoney(normal - precio)}`
                  : ''}
              </p>
            )}
          </div>

          <fieldset className="space-y-3">
            <legend className="label">
              {esPromo ? 'Servicio de la promoción' : 'Servicios y parte de cada uno'}
            </legend>
            {!esPromo && (
              <p className="field-help -mt-1">
                Cada colaborador comisiona sobre la parte de su servicio. Las partes deben sumar el
                precio del combo.
              </p>
            )}
            {(esPromo ? lineas.slice(0, 1) : lineas).map((l, i) => {
              const s = porId.get(l.servicio_id ?? -1);
              return (
                <div key={l.clave} className="rounded-md border border-border-subtle p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`cb-srv-${l.clave}`} className="sr-only">
                        Servicio {i + 1}
                      </label>
                      <select
                        id={`cb-srv-${l.clave}`}
                        className="select"
                        value={l.servicio_id ?? ''}
                        onChange={(e) =>
                          cambiarLinea(l.clave, {
                            servicio_id: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      >
                        <option value="">Elige un servicio…</option>
                        {porCategoria.map(([cat, lista]) => (
                          <optgroup key={cat} label={cat}>
                            {lista.map((sv) => (
                              <option key={sv.id} value={sv.id}>
                                {sv.nombre} · {formatMoney(sv.precio)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    {!esPromo && lineas.length > 2 && (
                      <button
                        type="button"
                        className="btn-icon shrink-0"
                        aria-label="Quitar servicio"
                        onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`cb-cant-${l.clave}`} className="text-xs text-text-secondary">
                        {esPromo ? 'Cuántos servicios' : 'Veces'}
                      </label>
                      <input
                        id={`cb-cant-${l.clave}`}
                        type="number"
                        min={1}
                        className="input tabular"
                        value={l.cantidad}
                        onChange={(e) =>
                          cambiarLinea(l.clave, { cantidad: Math.max(1, Number(e.target.value)) })
                        }
                      />
                    </div>
                    {!esPromo && (
                      <div>
                        <label
                          htmlFor={`cb-parte-${l.clave}`}
                          className="text-xs text-text-secondary"
                        >
                          Su parte del precio
                        </label>
                        <input
                          id={`cb-parte-${l.clave}`}
                          className="input tabular"
                          inputMode="numeric"
                          value={miles(l.parte)}
                          onChange={(e) =>
                            cambiarLinea(l.clave, { parte: aEntero(e.target.value) })
                          }
                        />
                      </div>
                    )}
                  </div>
                  {s && (
                    <p className="mt-1 text-xs text-text-muted">
                      {s.categoria ?? 'Sin categoría'} · normal{' '}
                      {formatMoney(Number(s.precio) * l.cantidad)}
                      {esPromo && precio > 0 && l.cantidad > 1
                        ? ` · cada uno queda en ${formatMoney(precio / l.cantidad)}`
                        : ''}
                    </p>
                  )}
                </div>
              );
            })}

            {!esPromo && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() =>
                    setLineas((ls) => [
                      ...ls,
                      { clave: Date.now(), servicio_id: null, cantidad: 1, parte: 0 },
                    ])
                  }
                >
                  <Plus size={16} aria-hidden="true" /> Agregar servicio
                </button>
                <button type="button" className="btn-ghost text-sm" onClick={repartir}>
                  <Scale size={16} aria-hidden="true" /> Repartir según precio normal
                </button>
              </div>
            )}

            {repetidos && (
              <div className="banner banner-warning text-sm">
                Un servicio no puede repetirse: usa «Veces».
              </div>
            )}
            {!esPromo && precio > 0 && (
              <div
                className={`banner text-sm ${cuadra ? 'banner-success' : 'banner-warning'}`}
                role="status"
              >
                Partes: {formatMoney(suma)} de {formatMoney(precio)}
                {cuadra
                  ? ' ✓'
                  : suma < precio
                    ? ` · faltan ${formatMoney(precio - suma)}`
                    : ` · sobran ${formatMoney(suma - precio)}`}
              </div>
            )}
          </fieldset>

          <div>
            <label htmlFor="cb-desc" className="label">
              Descripción (opcional)
            </label>
            <textarea
              id="cb-desc"
              rows={2}
              className="textarea"
              placeholder="Condiciones, días que aplica…"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
        </div>

        <footer className="drawer-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={!completo || guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </form>
    </>
  );
}

// ── Tarjeta ─────────────────────────────────────────────────────────────────
function TarjetaCombo({
  combo,
  onEditar,
  onCopiar,
}: {
  combo: Combo;
  onEditar: () => void;
  onCopiar: () => void;
}) {
  const qc = useQueryClient();
  const activar = useMutation({
    mutationFn: () => CombosService.cambiarActivo(combo.id, !combo.activo),
    onSuccess: (c) => {
      toast.success(c.activo ? 'Activado' : 'Desactivado');
      qc.invalidateQueries({ queryKey: ['combos'] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <li className="panel flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="badge">{combo.tipo === 'COMBO' ? 'Combo' : 'Promoción'}</span>
            <span className={BADGE_ESTADO[combo.estado]}>
              {combo.estado.charAt(0).toUpperCase() + combo.estado.slice(1)}
            </span>
          </p>
          <h3 className="mt-2 font-semibold text-text-primary">{combo.nombre}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-text-secondary">
            <CalendarRange size={12} aria-hidden="true" />
            {formatFecha(combo.fecha_inicio)} – {formatFecha(combo.fecha_fin)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-xl font-bold text-text-primary">{formatMoney(combo.precio)}</p>
          {combo.ahorro > 0 && (
            <p className="tabular text-xs text-text-muted">
              <s>{formatMoney(combo.precio_normal)}</s>
            </p>
          )}
        </div>
      </div>

      <ul className="mt-3 flex-1 divide-y divide-border-subtle border-t border-border-subtle text-sm">
        {combo.detalles.map((d) => (
          <li key={d.servicio_id} className="flex justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="text-text-primary">
                {d.servicio_nombre}
                {d.cantidad > 1 ? ` ×${d.cantidad}` : ''}
              </span>
              {d.categoria && <span className="block text-xs text-text-muted">{d.categoria}</span>}
            </span>
            <span className="tabular shrink-0 text-text-secondary">
              {formatMoney(d.precio_referencial)}
            </span>
          </li>
        ))}
      </ul>
      {combo.descripcion && <p className="mt-2 text-xs text-text-secondary">{combo.descripcion}</p>}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-border-subtle pt-3">
        <button type="button" className="btn-ghost text-sm" onClick={onEditar}>
          <Pencil size={15} aria-hidden="true" /> Editar
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={onCopiar}>
          <Copy size={15} aria-hidden="true" /> Copiar al mes siguiente
        </button>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() => activar.mutate()}
          disabled={activar.isPending}
        >
          <Power size={15} aria-hidden="true" /> {combo.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </li>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
type Formulario = { combo: Combo | null; tipo: TipoCombo; copiar?: boolean } | null;

export const CombosPage: React.FC = () => {
  const [filtro, setFiltro] = useState<EstadoCombo | 'todos'>('vigente');
  const [form, setForm] = useState<Formulario>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: KEY,
    queryFn: () => CombosService.listar(false),
  });
  const catalogo = useQuery({
    queryKey: ['catalogo', 'items', true],
    queryFn: () => CatalogoService.listarItems(true),
    staleTime: 5 * 60_000,
  });
  const servicios = useMemo(
    () =>
      (catalogo.data ?? [])
        .filter((i) => i.tipo === 'servicio' && i.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [catalogo.data],
  );

  const todos = data ?? [];
  const filas = filtro === 'todos' ? todos : todos.filter((c) => c.estado === filtro);
  const cuenta = (e: EstadoCombo | 'todos') =>
    e === 'todos' ? todos.length : todos.filter((c) => c.estado === e).length;

  return (
    <div className="page-container space-y-6">
      <PageHeader
        titulo="Combos y promociones"
        descripcion="Se fijan al inicio del mes. Cada colaborador registra su servicio eligiendo el combo y comisiona sobre su parte."
        icono={Gift}
        acciones={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => setForm({ combo: null, tipo: 'PROMOCION' })}
            >
              <Plus size={16} aria-hidden="true" /> Promoción
            </button>
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={() => setForm({ combo: null, tipo: 'COMBO' })}
            >
              <Plus size={16} aria-hidden="true" /> Combo
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por estado">
        {ESTADOS.map((e) => (
          <button
            key={e.valor}
            type="button"
            role="tab"
            aria-selected={filtro === e.valor}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              filtro === e.valor
                ? 'border-accent-from bg-accent-soft font-semibold text-text-primary'
                : 'border-border-subtle text-text-secondary hover:border-border-strong'
            }`}
            onClick={() => setFiltro(e.valor)}
          >
            {e.etiqueta} <span className="tabular text-text-muted">({cuenta(e.valor)})</span>
          </button>
        ))}
      </div>

      {isError && <div className="banner banner-danger">{friendlyError(error)}</div>}

      {isPending ? (
        <div className="skeleton h-40" />
      ) : filas.length === 0 ? (
        <div className="panel p-6 text-center text-body-sm text-text-muted">
          {todos.length === 0
            ? 'Aún no hay combos ni promociones. Crea los del mes con los botones de arriba.'
            : 'No hay combos en este estado.'}
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filas.map((c) => (
            <TarjetaCombo
              key={c.id}
              combo={c}
              onEditar={() => setForm({ combo: c, tipo: c.tipo })}
              onCopiar={() => setForm({ combo: c, tipo: c.tipo, copiar: true })}
            />
          ))}
        </ul>
      )}

      {form && (
        <FormCombo
          key={`${form.combo?.id ?? 'nuevo'}-${form.tipo}-${form.copiar ? 'c' : 'e'}`}
          combo={form.combo}
          tipoInicial={form.tipo}
          copiarAlMes={form.copiar}
          servicios={servicios}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
};

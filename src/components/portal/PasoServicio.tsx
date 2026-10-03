// src/components/portal/PasoServicio.tsx
import { useMemo, useState } from 'react';
import { Check, Gift, History, Search } from 'lucide-react';
import { formatMoney } from '../../lib/format';
import type { ItemCatalogo } from '../../services/catalog.service';
import type { Combo } from '../../services/combos.service';

/**
 * Paso 1 del asistente: **¿qué servicio hiciste?**
 *
 * Pensado para catálogos grandes (100+ servicios) en un celular:
 *
 * 1. **Combos y promociones vigentes** arriba: un toque elige el combo y el
 *    servicio que le toca al colaborador dentro de él. Si el combo tiene varios
 *    servicios de su área, pregunta cuál hizo.
 * 2. **Los que más haces**: sale de sus últimos registros (no se inventa).
 * 3. **Áreas** como fichas (Cabello, Uñas, Cejas…). Por defecto «Mi área», que
 *    se deduce del campo `área` del colaborador; así no ve 100 servicios, sólo
 *    los suyos. «Todas» sigue a un toque.
 * 4. El buscador busca siempre en todo el catálogo.
 *
 * El precio se muestra como información: lo pone el catálogo o el combo.
 */

/** Minúsculas, sin tildes y sin la «s» final (pestañas → pestana, cejas → ceja). */
function raiz(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/s$/, '');
}

/** ¿La categoría pertenece al área escrita en la ficha del colaborador? */
export function categoriaEnArea(categoria: string | null | undefined, area: string | null) {
  if (!categoria || !area) return false;
  const a = area.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return a.includes(raiz(categoria));
}

const TODAS = '__todas';
const MIA = '__mia';

function FilaServicio({
  servicio,
  activo,
  onSeleccionar,
  mostrarCategoria,
}: {
  servicio: ItemCatalogo;
  activo: boolean;
  onSeleccionar: (id: number) => void;
  mostrarCategoria: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={activo}
        onClick={() => onSeleccionar(servicio.id)}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left transition-colors ${
          activo
            ? 'border-accent-from bg-accent-from/10'
            : 'border-border-subtle bg-surface-card hover:bg-surface-card-hover'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
              activo ? 'border-accent-from bg-accent-from text-on-accent' : 'border-border-strong'
            }`}
          >
            {activo && <Check size={12} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-text-primary">
              {servicio.nombre}
            </span>
            {mostrarCategoria && servicio.categoria && (
              <span className="block truncate text-xs text-text-muted">{servicio.categoria}</span>
            )}
          </span>
        </span>
        <span className="tabular shrink-0 text-sm font-bold text-text-primary">
          {servicio.precio_min != null && servicio.precio_max != null
            ? `${formatMoney(servicio.precio_min)}+`
            : formatMoney(servicio.precio)}
        </span>
      </button>
    </li>
  );
}

function TarjetaCombo({
  combo,
  area,
  elegido,
  servicioElegidoId,
  onElegir,
}: {
  combo: Combo;
  area: string | null;
  elegido: boolean;
  servicioElegidoId: number | null;
  onElegir: (servicioId: number) => void;
}) {
  // Servicios del combo que puede hacer este colaborador (su área); si no se
  // sabe su área, cualquiera.
  const suyos = combo.detalles.filter((d) => !area || categoriaEnArea(d.categoria, area));
  const opciones = suyos.length ? suyos : combo.detalles;
  const unico = opciones.length === 1 ? opciones[0] : null;

  return (
    <li
      className={`w-64 shrink-0 snap-start rounded-md border p-3 ${
        elegido ? 'border-accent-from bg-accent-from/10' : 'border-border-subtle bg-surface-card'
      }`}
    >
      <button
        type="button"
        className="block w-full text-left"
        aria-pressed={elegido}
        onClick={() => onElegir((unico ?? opciones[0]).servicio_id)}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="badge text-xs">{combo.tipo === 'COMBO' ? 'Combo' : 'Promoción'}</span>
          <span className="tabular text-sm font-bold text-text-primary">
            {formatMoney(combo.precio)}
          </span>
        </span>
        <span className="mt-2 line-clamp-2 block text-sm font-semibold text-text-primary">
          {combo.nombre}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs text-text-secondary">
          {combo.detalles
            .map((d) => `${d.servicio_nombre}${d.cantidad > 1 ? ` ×${d.cantidad}` : ''}`)
            .join(' + ')}
        </span>
        {unico && (
          <span className="mt-2 block text-xs font-semibold text-accent-from">
            Tu parte: {formatMoney(unico.precio_referencial)}
          </span>
        )}
      </button>
      {!unico && (
        <div className="mt-2 border-t border-border-subtle pt-2">
          <p className="text-xs text-text-secondary">¿Cuál hiciste tú?</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {opciones.map((d) => {
              const activo = elegido && servicioElegidoId === d.servicio_id;
              return (
                <button
                  key={d.servicio_id}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onElegir(d.servicio_id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    activo
                      ? 'border-accent-from bg-accent-from text-on-accent'
                      : 'border-border-subtle text-text-primary'
                  }`}
                >
                  {d.servicio_nombre} · {formatMoney(d.precio_referencial)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}

export function PasoServicio({
  servicios,
  filtro,
  onFiltro,
  seleccionadoId,
  onSeleccionar,
  cargando,
  combos = [],
  comboId = null,
  onElegirCombo,
  area = null,
  frecuentes = [],
}: {
  servicios: ItemCatalogo[];
  filtro: string;
  onFiltro: (valor: string) => void;
  seleccionadoId: number | null;
  onSeleccionar: (id: number) => void;
  cargando: boolean;
  /** Combos y promociones vigentes hoy. */
  combos?: Combo[];
  comboId?: number | null;
  onElegirCombo?: (comboId: number, servicioId: number) => void;
  /** Campo «área» de la ficha del colaborador (texto libre). */
  area?: string | null;
  /** Ids de servicio ordenados por cuántas veces los ha registrado. */
  frecuentes?: number[];
}) {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const buscando = norm(filtro).length > 0;

  const categorias = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of servicios) {
      const c = s.categoria?.trim() || 'Otros';
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [servicios]);
  const misCategorias = categorias.filter(([c]) => categoriaEnArea(c, area)).map(([c]) => c);
  const tengoArea = misCategorias.length > 0;
  const [chip, setChip] = useState<string>(tengoArea ? MIA : TODAS);
  // Si el área llega después del catálogo, se aplica una vez.
  const [aplicado, setAplicado] = useState(tengoArea);
  if (!aplicado && tengoArea) {
    setAplicado(true);
    setChip(MIA);
  }

  const enChip = (s: ItemCatalogo) => {
    const c = s.categoria?.trim() || 'Otros';
    if (chip === TODAS) return true;
    if (chip === MIA) return misCategorias.includes(c);
    return c === chip;
  };

  const resultados = buscando
    ? servicios.filter(
        (s) =>
          norm(s.nombre).includes(norm(filtro)) || norm(s.categoria ?? '').includes(norm(filtro)),
      )
    : servicios.filter(enChip);

  const porId = new Map(servicios.map((s) => [s.id, s]));
  const masHaces = buscando
    ? []
    : frecuentes
        .map((id) => porId.get(id))
        .filter((s): s is ItemCatalogo => !!s)
        .slice(0, 4);

  // Combos que incluyen algún servicio del área del colaborador (o todos).
  const combosMios = combos.filter(
    (c) => !tengoArea || c.detalles.some((d) => categoriaEnArea(d.categoria, area)),
  );

  const etiquetaChip = (valor: string, texto: string, cuenta: number) => (
    <button
      key={valor}
      type="button"
      role="tab"
      aria-selected={chip === valor}
      onClick={() => setChip(valor)}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
        chip === valor
          ? 'border-accent-from bg-accent-from text-on-accent font-semibold'
          : 'border-border-subtle bg-surface-card text-text-secondary'
      }`}
    >
      {texto} <span className="tabular opacity-75">{cuenta}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      {combosMios.length > 0 && !buscando && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">
            <Gift size={13} aria-hidden="true" />
            Combos y promociones del mes
          </h3>
          <ul className="flex snap-x gap-3 overflow-x-auto pb-1">
            {combosMios.map((c) => (
              <TarjetaCombo
                key={c.id}
                combo={c}
                area={tengoArea ? area : null}
                elegido={comboId === c.id}
                servicioElegidoId={seleccionadoId}
                onElegir={(servicioId) => onElegirCombo?.(c.id, servicioId)}
              />
            ))}
          </ul>
        </section>
      )}

      <div>
        <label htmlFor="paso1-buscar" className="label">
          Buscar servicio
        </label>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            id="paso1-buscar"
            type="search"
            className="input pl-9"
            placeholder="Escribe parte del nombre…"
            autoComplete="off"
            value={filtro}
            onChange={(e) => onFiltro(e.target.value)}
          />
        </div>
      </div>

      {!buscando && categorias.length > 1 && (
        <div role="tablist" aria-label="Áreas" className="flex gap-2 overflow-x-auto pb-1">
          {tengoArea &&
            etiquetaChip(
              MIA,
              'Mi área',
              servicios.filter((s) => misCategorias.includes(s.categoria?.trim() || 'Otros'))
                .length,
            )}
          {categorias.map(([c, n]) => etiquetaChip(c, c, n))}
          {etiquetaChip(TODAS, 'Todas', servicios.length)}
        </div>
      )}

      {cargando ? (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only">Cargando el catálogo de servicios…</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 w-full" />
          ))}
        </div>
      ) : resultados.length === 0 ? (
        <div className="panel p-4 text-center">
          <p className="text-sm font-semibold text-text-primary">
            {servicios.length === 0 ? 'El catálogo está vacío' : 'Sin resultados'}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {servicios.length === 0
              ? 'No hay servicios activos en el catálogo. Pide a administración que dé de alta los servicios del spa antes de registrar.'
              : 'Ningún servicio coincide con tu búsqueda. Prueba con otra palabra o limpia el buscador.'}
          </p>
          {buscando && (
            <button
              type="button"
              className="btn-secondary mt-3 text-xs"
              onClick={() => onFiltro('')}
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {masHaces.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">
                <History size={13} aria-hidden="true" />
                Los que más haces
              </h3>
              <ul role="radiogroup" aria-label="Los que más haces" className="space-y-2">
                {masHaces.map((s) => (
                  <FilaServicio
                    key={s.id}
                    servicio={s}
                    activo={s.id === seleccionadoId && !comboId}
                    onSeleccionar={onSeleccionar}
                    mostrarCategoria={false}
                  />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
              {buscando
                ? `Resultados (${resultados.length})`
                : chip === MIA
                  ? `Mi área · ${misCategorias.join(', ')}`
                  : chip === TODAS
                    ? 'Todo el catálogo'
                    : chip}
            </h3>
            <ul role="radiogroup" aria-label="Servicios" className="space-y-2">
              {resultados.map((s) => (
                <FilaServicio
                  key={s.id}
                  servicio={s}
                  activo={s.id === seleccionadoId && !comboId}
                  onSeleccionar={onSeleccionar}
                  mostrarCategoria={buscando || chip === TODAS || chip === MIA}
                />
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

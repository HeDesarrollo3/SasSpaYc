// src/components/portal/PasoServicio.tsx
import { Check, Search, Sparkles } from 'lucide-react';
import { formatMoney } from '../../lib/format';
import type { ItemCatalogo } from '../../services/catalog.service';

/**
 * Paso 1 del asistente: **¿qué servicio hiciste?**
 *
 * Wireframe de la spec §3.18. Detalles que importan:
 *
 * - El precio se muestra como **información** (`formatMoney`), nunca dentro de un
 *   input: el colaborador no elige precios (regla *Numeric Authority*). Los
 *   resuelve el backend desde el catálogo.
 * - Es una selección única: `role="radiogroup"` con `aria-checked` en cada opción,
 *   para que funcione con teclado y con lector de pantalla.
 * - "Sugeridos" son los primeros del catálogo activo. **No hay endpoint de
 *   servicios frecuentes** en el backend, así que no se inventa un ranking: se
 *   etiqueta como lo que es y el buscador hace el resto.
 */

function FilaServicio({
  servicio,
  activo,
  onSeleccionar,
}: {
  servicio: ItemCatalogo;
  activo: boolean;
  onSeleccionar: (id: number) => void;
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
            {servicio.categoria && (
              <span className="block truncate text-[11px] text-text-muted">
                {servicio.categoria}
              </span>
            )}
          </span>
        </span>
        <span className="tabular shrink-0 text-sm font-bold text-text-primary">
          {formatMoney(servicio.precio)}
        </span>
      </button>
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
}: {
  servicios: ItemCatalogo[];
  filtro: string;
  onFiltro: (valor: string) => void;
  seleccionadoId: number | null;
  onSeleccionar: (id: number) => void;
  cargando: boolean;
}) {
  const norm = (s: string) => s.trim().toLowerCase();
  const buscando = norm(filtro).length > 0;
  const resultados = servicios.filter(
    (s) =>
      !buscando ||
      norm(s.nombre).includes(norm(filtro)) ||
      norm(s.categoria ?? '').includes(norm(filtro)),
  );
  const sugeridos = buscando ? [] : resultados.slice(0, 4);
  const resto = buscando ? resultados : resultados.slice(4);

  return (
    <div className="space-y-4">
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
            placeholder="Masaje, facial, depilación…"
            autoComplete="off"
            value={filtro}
            onChange={(e) => onFiltro(e.target.value)}
          />
        </div>
        <p className="field-help">
          El precio lo pone el catálogo: tú sólo eliges el servicio que hiciste.
        </p>
      </div>

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
          {sugeridos.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <Sparkles size={12} aria-hidden="true" />
                Sugeridos
              </h3>
              <ul role="radiogroup" aria-label="Servicios sugeridos" className="space-y-2">
                {sugeridos.map((s) => (
                  <FilaServicio
                    key={s.id}
                    servicio={s}
                    activo={s.id === seleccionadoId}
                    onSeleccionar={onSeleccionar}
                  />
                ))}
              </ul>
            </section>
          )}

          {resto.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                {buscando ? `Resultados (${resultados.length})` : 'Catálogo'}
              </h3>
              <ul role="radiogroup" aria-label="Catálogo de servicios" className="space-y-2">
                {resto.map((s) => (
                  <FilaServicio
                    key={s.id}
                    servicio={s}
                    activo={s.id === seleccionadoId}
                    onSeleccionar={onSeleccionar}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

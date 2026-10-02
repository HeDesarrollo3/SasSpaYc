// src/components/portal/PortalHeader.tsx
import { Info, Sparkles } from 'lucide-react';
import { formatMoney } from '../../lib/format';
import { BotonTema } from '../BotonTema';

/**
 * Topbar del shell móvil: saludo + comisiones de la semana en curso.
 *
 * Es deliberadamente simple (spec §2.2): el colaborador está de pie y con una
 * mano; aquí sólo necesita saber **quién** es y **cuánto lleva** esta semana.
 *
 * El importe del header no se pide aparte: sale de `useComandasDeLaSemana()`, que
 * el shell ya consulta y comparte por caché con `/app` y `/app/comisiones`.
 */
export function PortalHeader({
  nombre,
  comisionesSemana,
  cargando,
}: {
  nombre: string;
  /** `null` mientras no se puede calcular (migraciones pendientes o sin datos). */
  comisionesSemana: number | null;
  cargando: boolean;
}) {
  const primerNombre = nombre.trim().split(/\s+/)[0] || 'compañero';

  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg-elevated/85 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-text-primary">Hola, {primerNombre}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-text-muted">
            <Sparkles size={11} aria-hidden="true" />
            <span>Portal del colaborador</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <BotonTema />
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">
              Comisiones de la semana
            </p>
            {cargando ? (
              <div className="skeleton ml-auto h-5 w-20" />
            ) : (
              <p className="tabular text-base font-bold text-accent-from" aria-live="polite">
                {comisionesSemana === null ? '—' : formatMoney(comisionesSemana)}
              </p>
            )}
          </div>
        </div>
      </div>

      {comisionesSemana === null && !cargando && (
        <p className="mt-1.5 flex items-start gap-1 text-body-sm leading-4 text-text-muted">
          <Info size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Cuando cobren tu primer servicio de esta semana, aparecerá aquí.</span>
        </p>
      )}
    </header>
  );
}

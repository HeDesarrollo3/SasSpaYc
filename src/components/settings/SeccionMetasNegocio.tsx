// src/components/settings/SeccionMetasNegocio.tsx
//
// Metas del negocio (las que pinta el Dashboard). Antes no había un formulario
// para ellas: el Dashboard mandaba a «Ajustes» y allí sólo aparecían, sin
// explicación, entre las claves sueltas del final. Se guardan las cinco juntas
// en una sola operación (`PATCH /parametros`).
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import { toast } from 'sonner';

import { ParametrosService, type Parametro } from '../../services/parametros.service';
import { useRefrescarFormato } from '../../hooks/useFormato';
import { formatMoney } from '../../lib/format';
import { friendlyError } from '../../utils/error-messages';

const CAMPOS = [
  {
    clave: 'meta.ingresos_mes',
    etiqueta: 'Ventas del mes',
    ayuda: 'Cuánto quieres facturar en el mes.',
    dinero: true,
  },
  {
    clave: 'meta.ingresos_dia',
    etiqueta: 'Ventas del día',
    ayuda: 'Si lo dejas en 0, se calcula: meta del mes ÷ días laborables.',
    dinero: true,
  },
  {
    clave: 'meta.servicios_dia',
    etiqueta: 'Servicios por día',
    ayuda: 'Cantidad de servicios cobrados al día.',
    dinero: false,
  },
  {
    clave: 'meta.ticket_promedio',
    etiqueta: 'Ticket promedio',
    ayuda: 'Lo que debería gastar en promedio cada cliente.',
    dinero: true,
  },
  {
    clave: 'meta.dias_laborables_mes',
    etiqueta: 'Días laborables del mes',
    ayuda: 'Para medir el ritmo. Normalmente 26 (lunes a sábado).',
    dinero: false,
  },
] as const;

type Valores = Record<(typeof CAMPOS)[number]['clave'], string>;

function soloDigitos(texto: string) {
  return texto.replace(/[^\d]/g, '');
}

export function SeccionMetasNegocio({
  porClave,
  parametrosKey,
}: {
  porClave: Map<string, Parametro>;
  parametrosKey: readonly unknown[];
}) {
  const qc = useQueryClient();
  const refrescarFormato = useRefrescarFormato();

  const guardados = Object.fromEntries(
    CAMPOS.map((c) => [c.clave, porClave.get(c.clave)?.valor ?? '0']),
  ) as Valores;

  const [borrador, setBorrador] = useState<Valores | null>(null);
  const valores = borrador ?? guardados;
  const faltan = CAMPOS.filter((c) => !porClave.has(c.clave)).map((c) => c.clave);

  const guardar = useMutation({
    mutationFn: (v: Valores) =>
      ParametrosService.actualizarVarios(
        CAMPOS.map((c) => ({
          clave: c.clave,
          valor: String(Number(soloDigitos(v[c.clave]) || 0)),
        })),
      ),
    onSuccess: async () => {
      toast.success('Metas guardadas. El Dashboard ya las muestra.');
      setBorrador(null);
      await qc.invalidateQueries({ queryKey: parametrosKey });
      await refrescarFormato();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate(valores);
  };

  return (
    <section id="metas" className="panel space-y-4 p-6">
      <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
        <span className="text-accent-from" aria-hidden="true">
          <Target size={18} />
        </span>
        <div>
          <h2 className="text-h2 text-text-primary">Metas del negocio</h2>
          <p className="mt-0.5 text-body-sm text-text-muted">
            Lo que el Dashboard compara con lo vendido. Deja en 0 la que no quieras seguir.
          </p>
        </div>
      </div>

      {faltan.length > 0 && (
        <p className="field-error">Faltan en la base los parámetros: {faltan.join(', ')}.</p>
      )}

      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        {CAMPOS.map((c) => {
          const num = Number(soloDigitos(valores[c.clave]) || 0);
          return (
            <div key={c.clave}>
              <label htmlFor={`meta-${c.clave}`} className="label">
                {c.etiqueta}
              </label>
              <input
                id={`meta-${c.clave}`}
                inputMode="numeric"
                className="input tabular"
                value={valores[c.clave]}
                onChange={(e) => setBorrador({ ...valores, [c.clave]: e.target.value })}
              />
              <p className="field-help">
                {c.dinero && num > 0 ? `${formatMoney(num)} · ` : ''}
                {c.ayuda}
              </p>
            </div>
          );
        })}
        <div className="flex justify-end gap-2 sm:col-span-2">
          {borrador && (
            <button type="button" className="btn-ghost" onClick={() => setBorrador(null)}>
              Descartar
            </button>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={!borrador || guardar.isPending || faltan.length > 0}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar metas'}
          </button>
        </div>
      </form>
    </section>
  );
}

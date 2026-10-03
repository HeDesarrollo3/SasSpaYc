// src/components/cobros/ClienteCobro.tsx
//
// Al cobrar, recepción guarda o vincula al cliente (decisión 2026-10-03).
// El colaborador sólo escribió un nombre; aquí se completa con teléfono y fecha
// de nacimiento para las métricas de clientes. Un teléfono = un cliente: si el
// número ya existe se propone ese cliente en lugar de crear otro.
// Todo es opcional: sin datos, se cobra igual con el nombre escrito.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, UserPlus, UserRound, X } from 'lucide-react';
import { ClientesService, type Cliente } from '../../services/clientes.service';

export type ClienteElegido =
  | { tipo: 'existente'; id: number; nombre: string }
  | {
      tipo: 'nuevo';
      nombre: string;
      telefono: string;
      fecha_nacimiento: string;
      autoriza_datos: boolean;
    }
  | null;

function useDebounce<T>(valor: T, ms = 350): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function ClienteCobro({
  clienteIdActual,
  nombreEscrito,
  onCambio,
}: {
  /** `comandas.cliente_id`: si ya viene registrado no hay nada que hacer. */
  clienteIdActual: number | null;
  /** Nombre que escribió el colaborador. */
  nombreEscrito: string;
  onCambio: (c: ClienteElegido) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(nombreEscrito);
  const [telefono, setTelefono] = useState('');
  const [nacimiento, setNacimiento] = useState('');
  const [autoriza, setAutoriza] = useState(false);
  const [elegido, setElegido] = useState<Cliente | null>(null);

  const telDebounced = useDebounce(telefono);
  const nombreDebounced = useDebounce(nombre);
  const digitos = telDebounced.replace(/\D/g, '');

  const porTelefono = useQuery({
    queryKey: ['clientes', 'por-telefono', digitos],
    queryFn: () => ClientesService.porTelefono(digitos),
    enabled: abierto && !elegido && digitos.length >= 7,
  });
  const parecidos = useQuery({
    queryKey: ['clientes', 'buscar', nombreDebounced.trim().toLowerCase()],
    queryFn: () => ClientesService.buscar(nombreDebounced, 1, 5),
    enabled: abierto && !elegido && nombreDebounced.trim().length >= 3,
  });

  // Avisar al padre de lo que se cobrará.
  useEffect(() => {
    if (!abierto) return onCambio(null);
    if (elegido) return onCambio({ tipo: 'existente', id: elegido.id, nombre: elegido.nombre });
    if (nombre.trim().length < 2) return onCambio(null);
    onCambio({
      tipo: 'nuevo',
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      fecha_nacimiento: nacimiento,
      autoriza_datos: autoriza,
    });
    // `onCambio` es estable en el padre (setState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, elegido, nombre, telefono, nacimiento, autoriza]);

  if (clienteIdActual) {
    return (
      <p className="flex items-center gap-2 text-xs text-text-secondary">
        <CheckCircle2 size={14} className="text-success" aria-hidden="true" />
        Cliente registrado: el servicio quedará en su ficha.
      </p>
    );
  }

  if (!abierto) {
    return (
      <button type="button" className="btn-secondary w-full" onClick={() => setAbierto(true)}>
        <UserPlus size={16} aria-hidden="true" />
        Guardar cliente (teléfono y cumpleaños)
      </button>
    );
  }

  const coincidencia = porTelefono.data;
  const sugerencias = (parecidos.data?.data ?? []).slice(0, 5);

  return (
    <section className="panel space-y-3 p-4" aria-label="Datos del cliente">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <UserRound size={16} className="text-accent-from" aria-hidden="true" />
          Cliente
        </h3>
        <button
          type="button"
          className="btn-icon"
          aria-label="No guardar cliente"
          onClick={() => {
            setAbierto(false);
            setElegido(null);
          }}
        >
          <X size={16} />
        </button>
      </div>

      {elegido ? (
        <div className="banner banner-success">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Se cobrará a nombre de <strong>{elegido.nombre}</strong>
            {elegido.telefono ? ` (${elegido.telefono})` : ''}.
          </span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setElegido(null)}
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="cc-nombre" className="label">
              Nombre
            </label>
            <input
              id="cc-nombre"
              className="input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          {sugerencias.length > 0 && !coincidencia && (
            <div className="rounded-md border border-border-subtle p-2">
              <p className="mb-1 px-1 text-xs text-text-muted">¿Es alguno de estos clientes?</p>
              <ul>
                {sugerencias.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-surface-card-hover"
                      onClick={() => setElegido(c)}
                    >
                      <span className="text-text-primary">{c.nombre}</span>
                      <span className="tabular text-xs text-text-muted">{c.telefono ?? ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cc-telefono" className="label">
                Teléfono
              </label>
              <input
                id="cc-telefono"
                className="input tabular"
                inputMode="tel"
                placeholder="300 123 4567"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cc-nacimiento" className="label">
                Fecha de nacimiento
              </label>
              <input
                id="cc-nacimiento"
                type="date"
                className="input"
                value={nacimiento}
                onChange={(e) => setNacimiento(e.target.value)}
              />
            </div>
          </div>

          {coincidencia && (
            <div className="banner banner-info">
              <span className="flex-1">
                Ese teléfono ya es de <strong>{coincidencia.nombre}</strong>. ¿Es la misma persona?
              </span>
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => setElegido(coincidencia)}
              >
                Sí, usarlo
              </button>
            </div>
          )}

          <label className="flex items-start gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent-from)]"
              checked={autoriza}
              onChange={(e) => setAutoriza(e.target.checked)}
            />
            <span>
              El cliente <strong>autoriza</strong> que el spa guarde sus datos para avisos de citas,
              saludos de cumpleaños y promociones (Ley 1581 de 2012).
            </span>
          </label>
        </>
      )}
    </section>
  );
}

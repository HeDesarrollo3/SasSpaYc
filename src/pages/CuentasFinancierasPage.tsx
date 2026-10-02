// src/pages/CuentasFinancierasPage.tsx
//
// «Bancos y efectivo»: dónde está el dinero del spa.
//
// Cada cobro entra a una de estas cuentas y cada pago (liquidaciones, cuentas
// por pagar) sale de una de ellas. Aquí el administrador:
//   · ve el saldo que el sistema cree que hay en cada una;
//   · lo ajusta al saldo REAL (extracto del banco, app de Nequi, arqueo), con un
//     motivo que queda en auditoría;
//   · crea cuentas nuevas (otra cuenta de banco, Nequi, Daviplata…).
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Landmark, Plus, Smartphone, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '../components/PageHeader';
import { FinanzasService, type CuentaFinanciera } from '../services/finanzas.service';
import { formatMoney } from '../lib/format';
import { friendlyError } from '../utils/error-messages';

const KEY = ['finanzas', 'cuentas', 'gestion'];

const TIPOS: { valor: string; etiqueta: string }[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'BANCO', etiqueta: 'Cuenta bancaria' },
  { valor: 'BILLETERA_DIGITAL', etiqueta: 'Billetera digital (Nequi, Daviplata…)' },
  { valor: 'OTRO', etiqueta: 'Otra' },
];

function iconoDe(tipo: string) {
  if (tipo === 'EFECTIVO') return Banknote;
  if (tipo === 'BANCO') return Landmark;
  if (tipo === 'BILLETERA_DIGITAL') return Smartphone;
  return Wallet;
}

function etiquetaTipo(tipo: string) {
  return TIPOS.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

/** Acepta «1.250.000», «1250000» o «$ 1.250.000». */
function aEntero(texto: string): number | null {
  const limpio = texto.replace(/[^\d]/g, '');
  if (limpio === '') return null;
  return Number(limpio);
}

function TarjetaCuenta({ cuenta }: { cuenta: CuentaFinanciera }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [saldo, setSaldo] = useState('');
  const [motivo, setMotivo] = useState('');
  const Icono = iconoDe(cuenta.tipo);

  const ajustar = useMutation({
    mutationFn: () => FinanzasService.ajustarSaldo(cuenta.id, aEntero(saldo) ?? 0, motivo.trim()),
    onSuccess: (r) => {
      toast.success(
        `Saldo de ${cuenta.nombre} ajustado a ${formatMoney(r.saldo_actual)} ` +
          `(${r.diferencia >= 0 ? '+' : ''}${formatMoney(r.diferencia)}).`,
      );
      qc.invalidateQueries({ queryKey: ['finanzas'] });
      setAbierto(false);
      setSaldo('');
      setMotivo('');
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const saldoNum = aEntero(saldo);
  const valido = saldoNum !== null && motivo.trim().length >= 3;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (valido) ajustar.mutate();
  };

  return (
    <li className="panel flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
            <Icono size={20} className="text-text-secondary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-text-primary">{cuenta.nombre}</p>
            <p className="text-xs text-text-muted">
              {etiquetaTipo(cuenta.tipo)}
              {cuenta.numero_referencia ? ` · ${cuenta.numero_referencia}` : ''}
            </p>
          </div>
        </div>
        {!abierto && (
          <button
            type="button"
            className="btn-secondary shrink-0 text-sm"
            onClick={() => {
              setSaldo(String(Math.round(Number(cuenta.saldo_actual))));
              setAbierto(true);
            }}
          >
            Ajustar saldo
          </button>
        )}
      </div>

      <div>
        <p className="text-xs text-text-muted">Saldo según el sistema</p>
        <p className="tabular text-2xl font-bold text-text-primary">
          {formatMoney(Number(cuenta.saldo_actual))}
        </p>
      </div>

      {abierto && (
        <form onSubmit={enviar} className="space-y-3 border-t border-border pt-3">
          <div>
            <label htmlFor={`saldo-${cuenta.id}`} className="label">
              ¿Cuánto hay de verdad hoy?
            </label>
            <input
              id={`saldo-${cuenta.id}`}
              inputMode="numeric"
              className="input tabular"
              value={saldo}
              onChange={(e) => setSaldo(e.target.value)}
              autoFocus
            />
            {saldoNum !== null && (
              <p className="field-help">
                Quedará en {formatMoney(saldoNum)} (
                {saldoNum - Number(cuenta.saldo_actual) >= 0 ? '+' : ''}
                {formatMoney(saldoNum - Number(cuenta.saldo_actual))}).
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`motivo-${cuenta.id}`} className="label">
              Motivo
            </label>
            <input
              id={`motivo-${cuenta.id}`}
              className="input"
              placeholder="Ej.: saldo inicial según extracto del banco"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <p className="field-help">Queda registrado en Auditoría.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-sm" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary text-sm"
              disabled={!valido || ajustar.isPending}
            >
              {ajustar.isPending ? 'Guardando…' : 'Guardar saldo'}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

function FormNuevaCuenta({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('BANCO');
  const [referencia, setReferencia] = useState('');
  const [saldo, setSaldo] = useState('');

  const crear = useMutation({
    mutationFn: () =>
      FinanzasService.crear({
        nombre: nombre.trim(),
        tipo,
        numeroReferencia: referencia.trim() || undefined,
        saldoInicial: aEntero(saldo) ?? 0,
      }),
    onSuccess: () => {
      toast.success('Cuenta creada.');
      qc.invalidateQueries({ queryKey: ['finanzas'] });
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (nombre.trim().length >= 2) crear.mutate();
  };

  return (
    <form onSubmit={enviar} className="panel grid gap-3 p-4 sm:grid-cols-2">
      <div className="flex items-center justify-between sm:col-span-2">
        <h2 className="text-sm font-semibold text-text-primary">Nueva cuenta</h2>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>
      <div>
        <label htmlFor="nc-nombre" className="label">
          Nombre
        </label>
        <input
          id="nc-nombre"
          className="input"
          placeholder="Ej.: Nequi del spa"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="nc-tipo" className="label">
          Tipo
        </label>
        <select
          id="nc-tipo"
          className="select"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="nc-ref" className="label">
          Número o referencia (opcional)
        </label>
        <input
          id="nc-ref"
          className="input"
          placeholder="Ej.: últimos 4 dígitos"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="nc-saldo" className="label">
          Saldo que tiene hoy
        </label>
        <input
          id="nc-saldo"
          inputMode="numeric"
          className="input tabular"
          placeholder="0"
          value={saldo}
          onChange={(e) => setSaldo(e.target.value)}
        />
      </div>
      <div className="flex justify-end sm:col-span-2">
        <button
          type="submit"
          className="btn-primary text-sm"
          disabled={nombre.trim().length < 2 || crear.isPending}
        >
          {crear.isPending ? 'Creando…' : 'Crear cuenta'}
        </button>
      </div>
    </form>
  );
}

export const CuentasFinancierasPage: React.FC = () => {
  const [nueva, setNueva] = useState(false);
  const { data, isPending, isError, error } = useQuery({
    queryKey: KEY,
    queryFn: () => FinanzasService.listar({ activo: true }),
  });

  const cuentas = data ?? [];
  const total = cuentas.reduce((acc, c) => acc + Number(c.saldo_actual), 0);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        titulo="Bancos y efectivo"
        descripcion="Dónde está el dinero del spa. Cada cobro entra a una de estas cuentas y cada pago sale de una de ellas. Ajusta el saldo al valor real cuando revises el extracto o cuentes el efectivo."
        icono={Landmark}
        acciones={
          !nueva && (
            <button type="button" className="btn-primary text-sm" onClick={() => setNueva(true)}>
              <Plus size={16} aria-hidden="true" /> Nueva cuenta
            </button>
          )
        }
      />

      {nueva && <FormNuevaCuenta onClose={() => setNueva(false)} />}

      {isError && (
        <div className="banner banner-danger" role="alert">
          <span>{friendlyError(error)}</span>
        </div>
      )}

      {isPending ? (
        <div className="panel p-4 text-body-sm text-text-muted">Cargando cuentas…</div>
      ) : (
        <>
          <div className="panel flex items-center justify-between p-4">
            <span className="text-sm text-text-secondary">Total en todas las cuentas</span>
            <span className="tabular text-xl font-bold text-text-primary">
              {formatMoney(total)}
            </span>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cuentas.map((c) => (
              <TarjetaCuenta key={c.id} cuenta={c} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

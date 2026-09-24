import React, { useEffect, useState } from 'react';
import { DollarSign, Lock, Unlock, ArrowUpRight, ArrowDownLeft, Loader2, ShieldCheck } from 'lucide-react';
import { CajasService, type CajaSesion } from '../services/cajas.service';

export const CajasPage: React.FC = () => {
  const [cajaActiva, setCajaActiva] = useState<CajaSesion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formularios
  const [montoInicial, setMontoInicial] = useState('50.00');
  const [montoFinal, setMontoFinal] = useState('');
  const [montoMov, setMontoMov] = useState('');
  const [motivoMov, setMotivoMov] = useState('');
  const [tipoMov, setTipoMov] = useState<'INGRESO' | 'EGRESO'>('EGRESO');

  const cargarEstadoCaja = async () => {
    try {
      setLoading(true);
      setError(null);
      const cajas = await CajasService.getCajas();
      const abierta = cajas.find((c) => c.estado === 'ABIERTA');
      setCajaActiva(abierta || null);
    } catch (err: any) {
      setError(err.message || 'Error al consultar la caja');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarEstadoCaja();
  }, []);

  const handleApertura = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await CajasService.aperturar({ montoInicial: Number(montoInicial) });
      await cargarEstadoCaja();
    } catch (err: any) {
      setError(err.message || 'Error al abrir la caja');
      setLoading(false);
    }
  };

  const handleMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await CajasService.registrarMovimiento({
        tipo: tipoMov,
        monto: Number(montoMov),
        motivo: motivoMov,
      });
      setMontoMov('');
      setMotivoMov('');
      await cargarEstadoCaja();
    } catch (err: any) {
      setError(err.message || 'Error al registrar el movimiento');
      setLoading(false);
    }
  };

  const handleCierre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cajaActiva) return;
    try {
      setLoading(true);
      await CajasService.cerrar(cajaActiva.id, { montoFinal: Number(montoFinal) });
      setMontoFinal('');
      await cargarEstadoCaja();
    } catch (err: any) {
      setError(err.message || 'Error al realizar el cierre de caja');
      setLoading(false);
    }
  };

  if (loading && !cajaActiva) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-text-muted">
        <Loader2 className="mb-2 animate-spin text-accent-from" size={32} />
        <p className="text-xs">Consultando estado de caja...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <DollarSign size={24} className="text-accent-from" /> Control de Caja General
        </h1>
        <p className="mt-1 text-xs text-text-secondary">
          Apertura de turno, movimientos de efectivo y arqueo de cierre.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-error/20 bg-error/10 p-4 text-xs text-error">
          {error}
        </div>
      )}

      {!cajaActiva ? (
        /* Formulario de Apertura */
        <div className="glass-card max-w-md mx-auto p-6 rounded-md border border-border-card text-center space-y-4">
          <div className="p-3 bg-accent-from/10 text-accent-from rounded-full w-12 h-12 mx-auto flex items-center justify-center">
            <Unlock size={24} />
          </div>
          <h3 className="text-base font-bold text-text-primary">Apertura de Caja</h3>
          <p className="text-xs text-text-secondary">Ingresa el monto base en efectivo para iniciar las operaciones.</p>

          <form onSubmit={handleApertura} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-text-muted text-left mb-1">Monto Inicial ($)</label>
              <input
                type="number"
                step="0.01"
                required
                value={montoInicial}
                onChange={(e) => setMontoInicial(e.target.value)}
                className="w-full bg-background-card border border-border-card rounded p-2.5 text-lg font-bold text-text-primary focus:border-accent-from outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-accent-from to-accent-to text-white font-bold text-xs rounded hover:opacity-95"
            >
              Iniciar Turno de Caja
            </button>
          </form>
        </div>
      ) : (
        /* Panel de Caja Abierta */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Tarjeta Resumen */}
          <div className="lg:col-span-5 glass-card p-6 rounded-md space-y-4 border border-success/30">
            <div className="flex justify-between items-center">
              <span className="text-xs text-success font-semibold flex items-center gap-1 bg-success/10 px-2 py-1 rounded">
                <ShieldCheck size={14} /> Caja Operativa
              </span>
              <span className="text-xs text-text-muted">{new Date(cajaActiva.createdAt).toLocaleTimeString()}</span>
            </div>

            <div>
              <span className="text-xs text-text-muted">Monto Base Inicial</span>
              <p className="text-3xl font-bold text-text-primary mt-1">${Number(cajaActiva.montoInicial).toFixed(2)}</p>
            </div>

            {/* Cierre de Caja */}
            <form onSubmit={handleCierre} className="pt-4 border-t border-border-card space-y-3">
              <h4 className="text-xs font-bold text-text-primary flex items-center gap-1">
                <Lock size={14} className="text-error" /> Arqueo y Cierre de Turno
              </h4>
              <input
                type="number"
                step="0.01"
                required
                placeholder="Total efectivo en caja real"
                value={montoFinal}
                onChange={(e) => setMontoFinal(e.target.value)}
                className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary outline-none focus:border-error"
              />
              <button
                type="submit"
                className="w-full py-2 bg-error text-white text-xs font-bold rounded hover:opacity-90"
              >
                Cerrar Caja
              </button>
            </form>
          </div>

          {/* Formulario de Entradas / Salidas */}
          <div className="lg:col-span-7 glass-card p-6 rounded-md space-y-4">
            <h3 className="text-sm font-bold text-text-primary border-b border-border-card pb-2">
              Movimiento de Efectivo Manual
            </h3>

            <form onSubmit={handleMovimiento} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoMov('INGRESO')}
                  className={`py-2 text-xs font-bold rounded flex items-center justify-center gap-1 border ${
                    tipoMov === 'INGRESO' ? 'bg-success text-white border-success' : 'bg-background-card border-border-card text-text-muted'
                  }`}
                >
                  <ArrowDownLeft size={16} /> Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => setTipoMov('EGRESO')}
                  className={`py-2 text-xs font-bold rounded flex items-center justify-center gap-1 border ${
                    tipoMov === 'EGRESO' ? 'bg-error text-white border-error' : 'bg-background-card border-border-card text-text-muted'
                  }`}
                >
                  <ArrowUpRight size={16} /> Egreso / Retiro
                </button>
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1">Monto ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={montoMov}
                  onChange={(e) => setMontoMov(e.target.value)}
                  className="w-full bg-background-card border border-border-card rounded p-2 text-sm font-bold text-text-primary outline-none focus:border-accent-from"
                />
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1">Motivo / Concepto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pago de insumos de limpieza"
                  value={motivoMov}
                  onChange={(e) => setMotivoMov(e.target.value)}
                  className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary outline-none focus:border-accent-from"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-background-card border border-border-card text-text-primary font-bold text-xs rounded hover:border-accent-from"
              >
                Registrar Movimiento
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
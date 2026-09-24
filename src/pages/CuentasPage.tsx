import React, { useEffect, useState } from 'react';
import { CreditCard, ArrowUpRight, ArrowDownLeft, Loader2, DollarSign } from 'lucide-react';
import { CuentasService, type CuentaCobrar, type CuentaPagar } from '../services/cuentas.service';

export const CuentasPage: React.FC = () => {
  const [tab, setTab] = useState<'COBRAR' | 'PAGAR'>('COBRAR');
  const [cobrar, setCobrar] = useState<CuentaCobrar[]>([]);
  const [pagar, setPagar] = useState<CuentaPagar[]>([]);
  const [loading, setLoading] = useState(true);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [resCobrar, resPagar] = await Promise.all([
        CuentasService.getCuentasCobrar(),
        CuentasService.getCuentasPagar(),
      ]);
      setCobrar(resCobrar);
      setPagar(resPagar);
    } catch (err) {
      console.error('Error al cargar cuentas', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleAbonoCobrar = async (id: string) => {
    const monto = prompt('Ingrese el monto del abono:');
    if (!monto || isNaN(Number(monto))) return;
    try {
      setLoading(true);
      await CuentasService.registrarAbonoCliente(id, Number(monto));
      await cargarDatos();
    } catch (err: any) {
      alert(err.message || 'Error al abonar');
      setLoading(false);
    }
  };

  const handlePagoProveedor = async (id: string) => {
    const monto = prompt('Ingrese el monto a pagar:');
    if (!monto || isNaN(Number(monto))) return;
    try {
      setLoading(true);
      await CuentasService.registrarPagoProveedor(id, Number(monto));
      await cargarDatos();
    } catch (err: any) {
      alert(err.message || 'Error al registrar pago');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <CreditCard size={24} className="text-accent-from" /> Cuentas y Créditos
          </h1>
          <p className="mt-1 text-xs text-text-secondary">
            Administración de cuentas por cobrar a clientes y cuentas por pagar a proveedores.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-background-card p-1 border border-border-card rounded-md">
          <button
            onClick={() => setTab('COBRAR')}
            className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${
              tab === 'COBRAR' ? 'bg-accent-from text-white' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Por Cobrar (Clientes)
          </button>
          <button
            onClick={() => setTab('PAGAR')}
            className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${
              tab === 'PAGAR' ? 'bg-accent-from text-white' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Por Pagar (Proveedores)
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center text-text-muted">
          <Loader2 className="mb-2 animate-spin text-accent-from" size={32} />
          <p className="text-xs">Cargando cuentas...</p>
        </div>
      ) : (
        <div className="glass-card rounded-md overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background-card/50 border-b border-border-card text-[11px] uppercase text-text-muted">
                <th className="p-4 font-semibold">{tab === 'COBRAR' ? 'Cliente ID' : 'Proveedor'}</th>
                <th className="p-4 font-semibold">Monto Total</th>
                <th className="p-4 font-semibold">Pendiente</th>
                <th className="p-4 font-semibold text-center">Estado</th>
                <th className="p-4 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-card text-sm text-text-primary">
              {tab === 'COBRAR' ? (
                cobrar.map((item) => (
                  <tr key={item.id} className="hover:bg-background-card/30 transition-colors">
                    <td className="p-4 font-medium">{item.clienteId}</td>
                    <td className="p-4">${Number(item.montoTotal).toFixed(2)}</td>
                    <td className="p-4 font-bold text-accent-from">${Number(item.montoPendiente).toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${item.estado === 'PAGADO' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                        {item.estado}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {item.montoPendiente > 0 && (
                        <button onClick={() => handleAbonoCobrar(item.id)} className="px-3 py-1 bg-background-card border border-border-card hover:border-accent-from text-xs font-bold rounded">
                          Abonar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                pagar.map((item) => (
                  <tr key={item.id} className="hover:bg-background-card/30 transition-colors">
                    <td className="p-4 font-medium">{item.proveedor}</td>
                    <td className="p-4">${Number(item.montoTotal).toFixed(2)}</td>
                    <td className="p-4 font-bold text-error">${Number(item.montoPendiente).toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${item.estado === 'PAGADO' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                        {item.estado}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {item.montoPendiente > 0 && (
                        <button onClick={() => handlePagoProveedor(item.id)} className="px-3 py-1 bg-background-card border border-border-card hover:border-accent-from text-xs font-bold rounded">
                          Pagar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { X, CreditCard, DollarSign, ArrowRight, UserCheck, Loader2, CheckCircle2 } from 'lucide-react';
import { VentasService, type Colaborador } from '../../services/ventas.service';
import { type CartItem } from '../../hooks/useCart';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  total: number;
  onSuccess: () => void;
}

export const CheckoutModal: React.FC<Props> = ({ isOpen, onClose, items, total, onSuccess }) => {
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedColaborador, setSelectedColaborador] = useState<string>('');
  const [montoRecibido, setMontoRecibido] = useState<string>(total.toString());
  
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMontoRecibido(total.toString());
      setCompleted(false);
      setError(null);
      VentasService.getColaboradores()
        .then(setColaboradores)
        .catch(() => setError('No se pudieron cargar los colaboradores'));
    }
  }, [isOpen, total]);

  if (!isOpen) return null;

  const cambio = Math.max(0, Number(montoRecibido || 0) - total);

  const handleProcesarVenta = async () => {
    try {
      setSubmitting(true);
      setError(null);

      const dto = {
        metodoPago,
        montoRecibido: Number(montoRecibido),
        detalles: items.map((i) => ({
          productoId: i.tipo === 'PRODUCTO' ? i.id : undefined,
          servicioId: i.tipo === 'SERVICIO' ? i.id : undefined,
          colaboradorId: selectedColaborador || undefined,
          cantidad: i.cantidad,
          precioUnitario: i.precio,
        })),
      };

      await VentasService.crearVenta(dto);
      setCompleted(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Error al procesar la venta');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-md rounded-lg p-6 relative border border-border-card shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-text-muted hover:text-text-primary">
          <X size={20} />
        </button>

        {completed ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 size={48} className="mx-auto text-success animate-bounce" />
            <h3 className="text-lg font-bold text-text-primary">¡Venta Registrada!</h3>
            <p className="text-xs text-text-secondary">Sincronizado con Supabase e inventario actualizado.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-text-primary border-b border-border-card pb-2">Finalizar Pago</h2>

            {error && <div className="p-2.5 bg-error/10 border border-error/20 text-error text-xs rounded">{error}</div>}

            {/* Asignar Colaborador */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Colaborador / Especialista</label>
              <select
                value={selectedColaborador}
                onChange={(e) => setSelectedColaborador(e.target.value)}
                className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary"
              >
                <option value="">-- Sin asignar / General --</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            {/* Método de Pago */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Método de Pago</label>
              <div className="grid grid-cols-3 gap-2">
                {(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodoPago(m)}
                    className={`py-2 text-[11px] font-bold rounded border transition-all ${
                      metodoPago === m ? 'bg-accent-from text-white border-accent-from' : 'bg-background-card border-border-card text-text-secondary'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Cálculo de Efectivo */}
            {metodoPago === 'EFECTIVO' && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] text-text-muted mb-1">Monto Recibido</label>
                  <input
                    type="number"
                    value={montoRecibido}
                    onChange={(e) => setMontoRecibido(e.target.value)}
                    className="w-full bg-background-card border border-border-card rounded p-2 text-sm font-bold text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-1">Cambio / Vuelto</label>
                  <div className="p-2 bg-background-card border border-border-card rounded text-sm font-bold text-success">
                    ${cambio.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Resumen Final */}
            <div className="pt-3 border-t border-border-card flex justify-between items-center">
              <div>
                <span className="text-xs text-text-muted">Total a Pagar</span>
                <p className="text-xl font-bold text-accent-from">${total.toFixed(2)}</p>
              </div>

              <button
                disabled={submitting}
                onClick={handleProcesarVenta}
                className="px-5 py-2.5 bg-gradient-to-r from-accent-from to-accent-to text-white font-bold rounded flex items-center gap-2 hover:opacity-95 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <>Confirmar <ArrowRight size={16} /></>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
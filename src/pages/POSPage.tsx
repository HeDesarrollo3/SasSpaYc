import React, { useEffect, useState } from 'react';
import { ShoppingCart, Search, User, Trash2, Check, Loader2, DollarSign } from 'lucide-react';
import { api, type ApiResponse } from '../services/api';
import { type ItemCatalogo } from '../services/inventario.service';

interface CartItem extends ItemCatalogo {
  cantidad: number;
  colaboradorId?: string;
}

export const POSPage: React.FC = () => {
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [filtro, setFiltro] = useState('');
  const [categoria, setCategoria] = useState<'TODOS' | 'PRODUCTO' | 'SERVICIO'>('TODOS');
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const cargarCatalogo = async () => {
    try {
      setLoading(true);
      const res = await api.get<any, ApiResponse<ItemCatalogo[]>>('/catalogo');
      setCatalogo(res.data || []);
    } catch (err) {
      console.error('Error al cargar catálogo', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCatalogo();
  }, []);

  // Agregar item al carrito
  const agregarAlCarrito = (item: ItemCatalogo) => {
    setCarrito((prev) => {
      const existe = prev.find((i) => i.id === item.id);
      if (existe) {
        return prev.map((i) => (i.id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [...prev, { ...item, cantidad: 1 }];
    });
  };

  // Remover item
  const removerDelCarrito = (id: string) => {
    setCarrito((prev) => prev.filter((i) => i.id !== id));
  };

  // Modificar cantidad
  const cambiarCantidad = (id: string, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((i) => {
          if (i.id === id) {
            const nuevaCantidad = i.cantidad + delta;
            return nuevaCantidad > 0 ? { ...i, cantidad: nuevaCantidad } : i;
          }
          return i;
        })
        .filter((i) => i.cantidad > 0)
    );
  };

  const subtotal = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);

  const handleProcesarPago = async () => {
    if (carrito.length === 0) return;
    try {
      setProcesando(true);
      await api.post('/ventas', {
        items: carrito.map((item) => ({
          catalogoId: item.id,
          cantidad: item.cantidad,
          precioUnitario: item.precio,
          colaboradorId: item.colaboradorId || null,
        })),
        total: subtotal,
        metodoPago: 'EFECTIVO',
      });
      alert('¡Venta realizada con éxito!');
      setCarrito([]);
    } catch (err: any) {
      alert(err.message || 'Error al procesar la venta');
    } finally {
      setProcesando(false);
    }
  };

  const itemsFiltrados = catalogo.filter((item) => {
    const coincideFiltro =
      item.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
      (item.codigo && item.codigo.toLowerCase().includes(filtro.toLowerCase()));
    const coincideCategoria = categoria === 'TODOS' || item.tipo === categoria;
    return coincideFiltro && coincideCategoria;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-6rem)]">
      {/* Sección Izquierda: Catálogo */}
      <div className="lg:col-span-7 flex flex-col space-y-4">
        {/* Controles de búsqueda y filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar por nombre o código..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-full bg-background-card border border-border-card rounded-md pl-9 pr-3 py-2 text-xs text-text-primary outline-none focus:border-accent-from"
            />
          </div>
          <div className="flex bg-background-card p-1 border border-border-card rounded-md">
            {(['TODOS', 'SERVICIO', 'PRODUCTO'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoria(cat)}
                className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                  categoria === cat ? 'bg-accent-from text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Rejilla de Catálogo */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-text-muted">
              <Loader2 className="animate-spin text-accent-from mr-2" size={24} />
              <span className="text-xs">Cargando catálogo...</span>
            </div>
          ) : itemsFiltrados.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-xs">
              No se encontraron ítems en el catálogo del servidor.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {itemsFiltrados.map((item) => (
                <div
                  key={item.id}
                  onClick={() => agregarAlCarrito(item)}
                  className="glass-card p-3 rounded-md border border-border-card hover:border-accent-from cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        item.tipo === 'SERVICIO' ? 'bg-accent-to/20 text-accent-to' : 'bg-accent-from/20 text-accent-from'
                      }`}
                    >
                      {item.tipo}
                    </span>
                    <h4 className="text-xs font-bold text-text-primary mt-2 line-clamp-2">{item.nombre}</h4>
                  </div>
                  <div className="mt-3 flex justify-between items-center border-t border-border-card/50 pt-2">
                    <span className="text-xs font-extrabold text-accent-from">${Number(item.precio).toFixed(2)}</span>
                    <button className="p-1 bg-accent-from/10 text-accent-from rounded hover:bg-accent-from hover:text-white">
                      <ShoppingCart size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sección Derecha: Carrito / Orden */}
      <div className="lg:col-span-5 glass-card rounded-md p-4 flex flex-col justify-between border border-border-card">
        <div>
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2 border-b border-border-card pb-3">
            <ShoppingCart size={18} className="text-accent-from" /> Orden Actual
          </h3>

          <div className="divide-y divide-border-card max-h-[calc(100vh-20rem)] overflow-y-auto my-2">
            {carrito.length === 0 ? (
              <div className="text-center py-12 text-text-muted text-xs">El carrito está vacío</div>
            ) : (
              carrito.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <h5 className="text-xs font-bold text-text-primary">{item.nombre}</h5>
                    <span className="text-[11px] text-text-muted">${Number(item.precio).toFixed(2)} c/u</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => cambiarCantidad(item.id, -1)}
                      className="w-6 h-6 bg-background-card border border-border-card rounded text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold">{item.cantidad}</span>
                    <button
                      onClick={() => cambiarCantidad(item.id, 1)}
                      className="w-6 h-6 bg-background-card border border-border-card rounded text-xs font-bold"
                    >
                      +
                    </button>
                    <button onClick={() => removerDelCarrito(item.id)} className="text-error p-1 hover:bg-error/10 rounded">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer del Carrito / Cobro */}
        <div className="border-t border-border-card pt-4 space-y-3">
          <div className="flex justify-between items-center text-sm font-bold text-text-primary">
            <span>Total a Cobrar:</span>
            <span className="text-lg text-accent-from">${subtotal.toFixed(2)}</span>
          </div>

          <button
            onClick={handleProcesarPago}
            disabled={carrito.length === 0 || procesando}
            className="w-full py-3 bg-gradient-to-r from-accent-from to-accent-to text-white font-bold text-xs rounded-md flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-95"
          >
            {procesando ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <>
                <DollarSign size={16} /> Procesar Pago
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
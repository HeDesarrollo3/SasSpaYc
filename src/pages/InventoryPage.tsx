import React, { useEffect, useState } from 'react';
import { Package, Plus, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { api, type ApiResponse } from '../services/api';
import { InventarioService, type ItemCatalogo } from '../services/inventario.service';

export const InventoryPage: React.FC = () => {
  const [items, setItems] = useState<ItemCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Formulario
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [precio, setPrecio] = useState('');
  const [tipo, setTipo] = useState<'PRODUCTO' | 'SERVICIO'>('PRODUCTO');
  const [stock, setStock] = useState('0');

  const cargarCatalogo = async () => {
    try {
      setLoading(true);
      const response = await api.get<any, ApiResponse<ItemCatalogo[]>>('/catalogo');
      setItems(response.data || []);
    } catch (error) {
      console.error('Error al cargar catálogo', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCatalogo();
  }, []);

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await InventarioService.crear({
        nombre,
        codigo: codigo || undefined,
        precio: Number(precio),
        tipo,
        stock: tipo === 'PRODUCTO' ? Number(stock) : undefined,
      });

      // Reset formulario
      setNombre('');
      setCodigo('');
      setPrecio('');
      setStock('0');
      setShowModal(false);
      await cargarCatalogo();
    } catch (err: any) {
      alert(err.message || 'Error al guardar el ítem');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEliminar = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este ítem del catálogo?')) return;
    try {
      setLoading(true);
      await InventarioService.eliminar(id);
      await cargarCatalogo();
    } catch (err: any) {
      alert(err.message || 'Error al eliminar');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Package size={24} className="text-accent-from" /> Inventario y Catálogo
          </h1>
          <p className="mt-1 text-xs text-text-secondary">
            Administra los productos y servicios ofrecidos en la Terminal POS.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={cargarCatalogo}
            className="p-2 bg-background-card border border-border-card text-text-muted hover:text-text-primary rounded-md"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-accent-from to-accent-to text-white text-xs font-bold rounded-md flex items-center gap-2 hover:opacity-95"
          >
            <Plus size={16} /> Nuevo Producto / Servicio
          </button>
        </div>
      </header>

      {/* Tabla de Productos / Servicios */}
      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center text-text-muted">
          <Loader2 className="mb-2 animate-spin text-accent-from" size={32} />
          <p className="text-xs">Cargando inventario...</p>
        </div>
      ) : (
        <div className="glass-card rounded-md overflow-hidden border border-border-card">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background-card/50 border-b border-border-card text-[11px] uppercase text-text-muted">
                <th className="p-4 font-semibold">Tipo</th>
                <th className="p-4 font-semibold">Código</th>
                <th className="p-4 font-semibold">Nombre</th>
                <th className="p-4 font-semibold">Precio</th>
                <th className="p-4 font-semibold">Stock</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-card text-xs text-text-primary">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-background-card/30 transition-colors">
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.tipo === 'SERVICIO'
                          ? 'bg-accent-to/20 text-accent-to'
                          : 'bg-accent-from/20 text-accent-from'
                      }`}
                    >
                      {item.tipo}
                    </span>
                  </td>
                  <td className="p-4 text-text-muted font-mono">{item.codigo || '-'}</td>
                  <td className="p-4 font-bold">{item.nombre}</td>
                  <td className="p-4 font-semibold">${Number(item.precio).toFixed(2)}</td>
                  <td className="p-4">
                    {item.tipo === 'PRODUCTO' ? item.stock ?? 0 : 'N/A (Servicio)'}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleEliminar(item.id)}
                      className="p-1.5 bg-error/10 text-error hover:bg-error hover:text-white rounded transition-colors"
                      title="Eliminar ítem"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-muted text-xs">
                    No hay ítems registrados en el catálogo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal para Crear Ítem */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md rounded-lg p-6 relative border border-border-card space-y-4">
            <h3 className="text-sm font-bold text-text-primary border-b border-border-card pb-2">
              Agregar al Catálogo
            </h3>

            <form onSubmit={handleCrear} className="space-y-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Tipo de Ítem</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipo('PRODUCTO')}
                    className={`py-1.5 text-xs font-bold rounded border ${
                      tipo === 'PRODUCTO'
                        ? 'bg-accent-from text-white border-accent-from'
                        : 'bg-background-card border-border-card text-text-muted'
                    }`}
                  >
                    Producto
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo('SERVICIO')}
                    className={`py-1.5 text-xs font-bold rounded border ${
                      tipo === 'SERVICIO'
                        ? 'bg-accent-to text-white border-accent-to'
                        : 'bg-background-card border-border-card text-text-muted'
                    }`}
                  >
                    Servicio
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Corte de Cabello / Champú"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary outline-none focus:border-accent-from"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Código (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: PROD-01"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary outline-none focus:border-accent-from"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Precio ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary outline-none focus:border-accent-from"
                  />
                </div>
              </div>

              {tipo === 'PRODUCTO' && (
                <div>
                  <label className="block text-xs text-text-muted mb-1">Stock Inicial</label>
                  <input
                    type="number"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary outline-none focus:border-accent-from"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-gradient-to-r from-accent-from to-accent-to text-white text-xs font-bold rounded hover:opacity-90 flex items-center justify-center gap-1"
                >
                  {submitting ? <Loader2 className="animate-spin" size={14} /> : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 bg-background-card border border-border-card text-text-muted text-xs font-bold rounded hover:text-text-primary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
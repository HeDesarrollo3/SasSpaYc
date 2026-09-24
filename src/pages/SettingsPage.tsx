import React, { useState } from 'react';
import { Settings, Store, Receipt, Shield, Save } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [nombreComercio, setNombreComercio] = useState('MiTienda POS');
  const [impuesto, setImpuesto] = useState('19');
  const [moneda, setMoneda] = useState('USD');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Configuración guardada correctamente.');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Settings size={24} className="text-accent-from" /> Configuración General
        </h1>
        <p className="mt-1 text-xs text-text-secondary">
          Parámetros globales de la tienda, impuestos y comprobantes.
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Sección Datos del Comercio */}
        <div className="glass-card p-6 rounded-md border border-border-card space-y-4">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2 border-b border-border-card pb-2">
            <Store size={18} className="text-accent-from" /> Información del Establecimiento
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Nombre Comercial</label>
              <input
                type="text"
                value={nombreComercio}
                onChange={(e) => setNombreComercio(e.target.value)}
                className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary outline-none focus:border-accent-from"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Moneda del Sistema</label>
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary outline-none focus:border-accent-from"
              >
                <option value="USD">USD ($) - Dólar</option>
                <option value="COP">COP ($) - Peso Colombiano</option>
                <option value="MXN">MXN ($) - Peso Mexicano</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sección Impuestos y Facturación */}
        <div className="glass-card p-6 rounded-md border border-border-card space-y-4">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2 border-b border-border-card pb-2">
            <Receipt size={18} className="text-accent-to" /> Impuestos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Porcentaje de Impuesto / IVA (%)</label>
              <input
                type="number"
                value={impuesto}
                onChange={(e) => setImpuesto(e.target.value)}
                className="w-full bg-background-card border border-border-card rounded p-2 text-xs text-text-primary outline-none focus:border-accent-from"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="px-6 py-2.5 bg-gradient-to-r from-accent-from to-accent-to text-white font-bold text-xs rounded-md flex items-center gap-2 hover:opacity-95"
        >
          <Save size={16} /> Guardar Cambios
        </button>
      </form>
    </div>
  );
};
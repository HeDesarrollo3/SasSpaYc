// src/App.tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { MainLayout } from './components/MainLayout';
import { DashboardPage } from './pages/DashboardPage';
import { POSPage } from './pages/POSPage';
import { ColaboradoresPage } from './pages/ColaboradoresPage';
import { CajasPage } from './pages/CajasPage';
import { CuentasPage } from './pages/CuentasPage';
import { SettingsPage } from './pages/SettingsPage';
import { InventoryPage } from './pages/InventoryPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireRole } from './components/RequireRole';
import { UsuariosPage } from './pages/UsuariosPage';
import  AuditoriaPage  from './pages/AuditoriaPage';

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="pos" element={<POSPage />} />

        {/* Solo admin */}
        <Route
          path="colaboradores"
          element={
            <RequireRole roles={['administrador']}>
              <ColaboradoresPage />
            </RequireRole>
          }
        />
        <Route
          path="inventory"
          element={
            <RequireRole roles={['administrador']}>
              <InventoryPage />
            </RequireRole>
          }
        />

        {/* Admin + cajero */}
        <Route
          path="caja"
          element={
            <RequireRole roles={['administrador', 'cajero']}>
              <CajasPage />
            </RequireRole>
          }
        />
        <Route
          path="cuentas"
          element={
            <RequireRole roles={['administrador', 'cajero']}>
              <CuentasPage />
            </RequireRole>
          }
        />

        <Route
          path="settings"
          element={
            <RequireRole roles={['administrador']}>
              <SettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="usuarios"
          element={
            <RequireRole roles={['administrador']}>
              <UsuariosPage />
            </RequireRole>
          }
        />
      </Route>

      <Route
  path="auditoria"
  element={
    <RequireRole roles={['administrador']}>
      <AuditoriaPage />
    </RequireRole>
  }
/>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default App;
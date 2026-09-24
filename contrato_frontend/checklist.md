# ☑️ Checklist del Proyecto - Frontend SPA

Este documento rastrea el progreso del desarrollo del frontend de la aplicación.
Referencias: `DISENO_GUIDELINES.md` (diseño) y `API_CONTRATO.md` (backend SPED v2).

## Fase 1: Setup y Arquitectura (Layout Premium)
- [x] Inicialización con React + Vite.
- [x] Configuración de variables CSS y Sistema de Diseño (Glassmorphism) — tokens estrictos §2–§5 en `src/index.css`.
- [x] Maquetación del Layout Principal (Sidebar, Navbar responsivo) — Grid/Flex, breakpoints sm/md/lg/xl (§8), `Esc` cierra el menú, `aria-label`s.
- [x] Configuración del Router (`react-router-dom`) + títulos dinámicos por vista.
- [x] Configuración del Cliente HTTP (Axios con base URL `/api/v1`, `API_CONTRATO.md` §1).

## Fase 2: Dashboard y Autenticación
- [x] Dashboard Principal (KPIs, skeletons de carga §6, estados con ícono + texto §3).
- [ ] Pantalla de Login con diseño atractivo.
- [x] Interceptores HTTP (token + manejo global por códigos estables SPED §5; `401` limpia sesión).

## Fase 3: Módulos Core (Vistas y Formularios)
- [ ] **Módulo Ventas**: registro con `postIdempotent()` + tabla paginada (`meta`, `API_CONTRATO.md` §3–§4).
- [ ] **Módulo Cajas**: apertura G3b, arqueo/cierre, ingresos/egresos.
- [ ] **Módulo Colaboradores**: gestión de liquidaciones y pagos (firma vigente).
- [ ] **Cuentas por cobrar/pagar**: altas + abonos/pagos idempotentes.
- [ ] **Catálogos**: CRUD para Usuarios, Clientes, Productos, Servicios, Promociones (`/catalogo/*`, altas solo admin).
- [ ] **Auditoría**: consulta paginada (solo admin).

## Fase 4: Pulido y Optimización
- [x] Micro-animaciones con tokens de motion (`transform`/`opacity`, `reduced-motion`, §6).
- [x] Estados de carga elegantes (skeletons con shimmer, §6).
- [x] Revisión de accesibilidad base (foco visible, contraste tokens, labels, `alt`, títulos dinámicos, §9).
- [x] Reglas de código (§10): cero `style=""` no dinámico, cero hex/px mágicos, `kebab-case`, un componente = un archivo.
- [ ] Formularios restantes con `<label>` + `.field-error` y errores mapeados por código API (§6 `API_CONTRATO.md`).

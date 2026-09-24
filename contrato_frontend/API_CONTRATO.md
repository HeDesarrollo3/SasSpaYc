# 🔌 Contrato API para el Frontend — Backend SPED v2

> Fuente: `backend-spa/backend/contrato_backend/SPED_BACKEND_GUIDELINES.md`.
> Este documento es el resumen operativo para desarrollar el front. Ante
> cualquier duda, manda el guideline del backend y el Swagger en `/api/docs`.

## 1. Base y versionado (SPED §9)

- Base URL: `http://localhost:3000/api/v1` (ver `src/services/api.ts` → `API_BASE_URL`).
- Un cambio incompatible crea `/api/v2`, nunca rompe `v1`.
- Auth: `Authorization: Bearer <jwt>` (se inyecta por interceptor).
- Docs interactivas: `http://localhost:3000/api/docs` (no productivo).

## 2. Envelopes (SPED §5) — usar los tipos de `src/services/api.ts`

Éxito:

```json
{ "success": true, "statusCode": 201, "data": { "venta_id": 1045 }, "timestamp": "..." }
```

Colección paginada (SPED §6):

```json
{
  "success": true, "statusCode": 200,
  "data": [ /* ... */ ],
  "meta": { "page": 1, "limit": 20, "total": 142, "totalPages": 8 },
  "timestamp": "..."
}
```

Error — **decidir por `error` (código estable), nunca parsear `message`**:

```json
{ "success": false, "statusCode": 409, "error": "INSUFFICIENT_STOCK", "message": "...", "timestamp": "..." }
```

| `statusCode` | `error` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | DTO inválido |
| 401 | `UNAUTHORIZED` | Sin token o inválido → limpiar `localStorage.token` |
| 403 | `FORBIDDEN` | Rol insuficiente |
| 404 | `NOT_FOUND` | Registro inexistente |
| 409 | `DUPLICATE_ENTRY` | Único violado |
| 409 | `INSUFFICIENT_STOCK` | Sin stock (G1) |
| 422 | `INVALID_STATE` / `FOREIGN_KEY_VIOLATION` | Estado inválido / referencia rota |
| 500 | `INTERNAL_ERROR` | No anticipado |

## 3. Paginación y filtrado (SPED §6)

```
GET /api/v1/ventas?page=1&limit=20&sort=-fecha_hora&estado=pagada
```

- `limit` máx. 100. `sort` con prefijo `-` = descendente.
- Mostrar skeletons durante la carga (Design System §6), nunca pantalla en blanco.

## 4. Idempotencia financiera (SPED §7)

`POST /ventas`, `/ventas/:id/pagos`, `/colaboradores/liquidaciones/:id/pagos`,
`/cuentas-cobrar/:id/abonos`, `/cuentas-pagar/:id/pagos` **deben** enviar
`Idempotency-Key: <uuid>` (usar `postIdempotent()` de `src/services/api.ts`).
Ante reintento, el backend devuelve la respuesta original sin duplicar el cobro.

## 5. Mapa de endpoints (SPED §4)

| Método | Ruta `/api/v1` | Notas |
|---|---|---|
| `GET/POST` | `/ventas` | `POST` idempotente; `GET ?estado=` |
| `POST` | `/ventas/:id/pagos` | Idempotente (`forma_pago`, `cuenta_financiera_id`) |
| `GET` | `/ventas/:id/comisiones` | G6 |
| `GET/POST` | `/cajas` · `/cajas/apertura` · `/cajas/movimientos` · `/cajas/:id/cierre` | Apertura G3b |
| `GET/POST` | `/colaboradores` · `/colaboradores/liquidaciones` · `/colaboradores/liquidaciones/:id/pagos` | Pago idempotente, firma vigente |
| `GET/POST` | `/cuentas-cobrar` · `/cuentas-cobrar/:id/abonos` | Abono idempotente |
| `GET/POST` | `/cuentas-pagar` · `/cuentas-pagar/:id/pagos` | Pago idempotente |
| `GET` | `/auditoria` | Solo `admin` |
| `GET/POST` | `/catalogo/clientes|productos|servicios|promociones` | Altas solo `admin` (DEFINER) |
| `GET/POST` | `/usuarios` | Solo `admin` |

Formas de pago vigentes: `efectivo | tarjeta | transferencia` (campo `forma_pago`
+ `cuenta_financiera_id`; el legacy `metodo_pago` ya no existe).

## 6. Reglas de UI vinculadas al contrato

- Los errores de negocio se muestran por código (`INSUFFICIENT_STOCK` → modal
  de stock, `FORBIDDEN` → aviso de rol), con ícono + texto (Design System §3).
- `401` → limpiar sesión (ya lo hace el interceptor de `api.ts`).
- Formularios: `<label>` asociado + mensaje de error bajo el campo (`.field-error`).

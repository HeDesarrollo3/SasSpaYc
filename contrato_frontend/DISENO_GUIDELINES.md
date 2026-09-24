# 🎨 Design System — Frontend SPA

> **Contrato de diseño.** Este documento es la fuente única de verdad para todo el UI de la aplicación. Ningún componente, página o feature se implementa sin seguir estas reglas. Si algo no está cubierto aquí, se propone como extensión de este documento antes de construirse — no se improvisa en el código.

---

## 1. Principios

| Principio | Qué significa en la práctica |
|---|---|
| **Premium, no recargado** | Prioriza espacio en blanco sobre densidad. Si una pantalla se siente apretada, sobra contenido o falta jerarquía — no falta color. |
| **Profundidad con propósito** | Glassmorphism y sombras se usan para comunicar jerarquía (qué flota sobre qué), no como decoración repetida en todo. |
| **Consistencia sobre creatividad puntual** | Un mismo componente se ve y se comporta igual en toda la app. La creatividad va en la identidad de marca (color, tipografía), no en reinventar el botón en cada pantalla. |
| **Accesible por defecto** | Contraste AA mínimo, foco visible, y `prefers-reduced-motion` respetado. No son "mejoras futuras", son parte de la definición de "terminado".|

---

## 2. Tipografía

**Familia:** `Inter` (principal, variable font). Fallback: `-apple-system, "Outfit", sans-serif`.

Un único type family para toda la app. No mezclar con una segunda fuente "decorativa" — la jerarquía se logra con peso y tamaño, no con fuentes distintas.

### Escala tipográfica

| Token | Tamaño / Line-height | Peso | Uso |
|---|---|---|---|
| `text-display` | 40px / 48px | 800 (ExtraBold) | Hero / título de página única vez por vista |
| `text-h1` | 28px / 36px | 700 (Bold) | Encabezado principal de sección |
| `text-h2` | 20px / 28px | 600 (SemiBold) | Subsecciones, títulos de tarjeta |
| `text-body` | 15px / 24px | 400 (Regular) | Texto de cuerpo |
| `text-body-sm` | 13px / 20px | 400 (Regular) | Metadatos, ayudas, timestamps |
| `text-label` | 12px / 16px | 600 (SemiBold) | Labels de formulario, tags — **sin** mayúsculas forzadas |

**Reglas:**
- Nunca uses `font-weight: 900` salvo en `text-display`.
- No apliques `text-transform: uppercase` a labels o botones — se ve genérico y reduce legibilidad. Usa peso y color para jerarquía, no mayúsculas.
- Longitud de línea de texto de cuerpo: máx. 75 caracteres (`max-width: 65ch`).

---

## 3. Color

Paleta cerrada. No se introducen colores fuera de esta tabla sin actualizar este documento.

### Fondo y superficies

| Token | Valor | Uso |
|---|---|---|
| `--bg-base` | `#0B1120` | Fondo raíz de la app |
| `--bg-elevated` | `#111827` | Paneles, sidebar, header |
| `--surface-card` | `rgba(255,255,255,0.04)` | Tarjetas (glass) |
| `--surface-card-hover` | `rgba(255,255,255,0.07)` | Tarjeta en hover |
| `--border-subtle` | `rgba(255,255,255,0.08)` | Bordes de tarjetas/inputs |
| `--border-strong` | `rgba(255,255,255,0.16)` | Bordes con foco/activos |

### Texto

| Token | Valor | Uso |
|---|---|---|
| `--text-primary` | `#F8FAFC` | Títulos, texto de alto énfasis |
| `--text-secondary` | `#94A3B8` | Cuerpo de texto, descripciones |
| `--text-muted` | `#64748B` | Metadatos, placeholders |

### Marca y estado

| Token | Valor | Uso |
|---|---|---|
| `--accent-from` / `--accent-to` | `#6366F1` → `#8B5CF6` | Gradiente primario: CTAs, elementos activos, progreso |
| `--success` | `#22C55E` | Confirmaciones |
| `--warning` | `#F59E0B` | Advertencias |
| `--danger` | `#EF4444` | Errores, acciones destructivas |
| `--info` | `#38BDF8` | Mensajes informativos |

**Reglas:**
- El gradiente de acento se reserva para **una sola acción protagonista por vista** (el CTA principal). Si todo es gradiente, nada destaca.
- Estados de color (`success`/`warning`/`danger`) siempre se combinan con un ícono o texto — nunca solo color, por accesibilidad (daltonismo).
- Prohibido: negro puro (`#000`), blanco puro (`#FFF`), y colores planos sin token (`red`, `blue`, hex "porque sí").

---

## 4. Espaciado y Grid

Sistema de 8pt. Todo margin/padding es múltiplo de `4px`, preferentemente de `8px`.

| Token | Valor |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-12` | 48px |

- **Grid** (CSS Grid): layouts de página y dashboards.
- **Flexbox**: alineación interna de componentes (barras, filas de card, navbars).
- Radio de borde: `--radius-sm: 8px` (inputs, chips), `--radius-md: 12px` (tarjetas), `--radius-lg: 20px` (modales, paneles grandes). Nunca mezclar más de 2 radios distintos en una misma vista.

---

## 5. Elevación (Glassmorphism con criterio)

El efecto vidrio se usa para **paneles flotantes sobre contenido** (modales, dropdowns, tarjetas sobre un fondo con gradiente/imagen). No se aplica a superficies planas de layout (ej. el fondo del sidebar no necesita blur).

```css
.card {
  background: var(--surface-card);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
}
```

| Nivel | Uso | Sombra |
|---|---|---|
| `elevation-0` | Contenido plano en el fondo | ninguna |
| `elevation-1` | Tarjetas en lista | `0 4px 16px rgba(0,0,0,.18)` |
| `elevation-2` | Tarjeta activa/hover, dropdowns | `0 8px 32px rgba(0,0,0,.24)` |
| `elevation-3` | Modales, popovers críticos | `0 16px 48px rgba(0,0,0,.36)` |

---

## 6. Interacción y Motion

| Propiedad | Valor |
|---|---|
| Duración estándar | `180ms` |
| Duración énfasis (modal, panel) | `250ms` |
| Curva | `cubic-bezier(0.4, 0, 0.2, 1)` (`ease-out` estándar) |

**Reglas:**
- Todo elemento interactivo (botón, tarjeta clicable, link, ítem de lista) define explícitamente los estados: `default`, `hover`, `active/pressed`, `focus-visible`, `disabled`. No basta con `hover`.
- Hover en tarjetas/botones: `transform: translateY(-2px)` + aumento leve de sombra. Nunca escalar (`scale`) elementos con texto — distorsiona la tipografía.
- `focus-visible` es obligatorio y distinto del hover: outline de 2px con `--accent-from`, offset 2px. Nunca `outline: none` sin reemplazo.
- Anima solo `transform` y `opacity` cuando sea posible (rendimiento). Evita animar `width`/`height`/`box-shadow` completos en listas largas.
- Respeta `prefers-reduced-motion: reduce` — desactiva transiciones no esenciales (deja las de feedback funcional, como loading).
- **Loading:** skeletons con shimmer sutil (gradiente animado sobre `--surface-card`), nunca pantalla en blanco ni spinner genérico de navegador.

---

## 7. Componentes base

### Botones

| Variante | Fondo | Texto | Uso |
|---|---|---|---|
| Primario | gradiente `--accent-from → --accent-to` | `--text-primary` | 1 por vista, acción principal |
| Secundario | `--surface-card` + `--border-subtle` | `--text-primary` | Acciones alternativas |
| Ghost/terciario | transparente | `--text-secondary` | Acciones de bajo énfasis |
| Destructivo | `--danger` (sólido, no gradiente) | blanco | Eliminar, cancelar suscripción, etc. |

Todos: `padding: 10px 20px`, `border-radius: var(--radius-sm)`, transición estándar, estado `disabled` con `opacity: .45` + `cursor: not-allowed`.

### Inputs

- Fondo `--surface-card`, borde `--border-subtle`.
- Foco: borde `--border-strong` + glow sutil de 3px con el color de acento al 20% de opacidad.
- Error: borde `--danger` + mensaje de ayuda en `text-body-sm` color `--danger` debajo del campo (nunca solo el borde rojo sin texto).

---

## 8. Responsividad

Mobile-first. Breakpoints:

| Token | Ancho | Comportamiento de navegación |
|---|---|---|
| `sm` | ≥ 640px | Menú hamburguesa, contenido en 1 columna |
| `md` | ≥ 768px | Sidebar colapsado a íconos |
| `lg` | ≥ 1024px | Sidebar completo, layout multi-columna |
| `xl` | ≥ 1280px | Máximo ancho de contenido: `1280px`, centrado |

---

## 9. Accesibilidad (no negociable)

- Contraste mínimo AA: 4.5:1 texto normal, 3:1 texto grande/UI.
- Todo elemento interactivo es alcanzable y operable por teclado (`Tab`, `Enter`, `Esc` en modales).
- Imágenes decorativas: `alt=""`. Imágenes informativas: `alt` descriptivo.
- Formularios: cada input con `<label>` asociado (no solo placeholder).

---

## 10. Reglas de código

- Colores, espaciados, radios y tipografía **siempre** vía variables/tokens (CSS custom properties o el theme del framework). Ningún hex ni px "mágico" suelto en componentes.
- Prohibido `style="..."` inline, salvo valores verdaderamente dinámicos calculados en runtime (ej. `width` de una barra de progreso).
- Nomenclatura de clases/tokens: `kebab-case`, con prefijo por categoría (`bg-`, `text-`, `space-`, `radius-`).
- Un componente = un archivo. No estilos duplicados entre componentes: si dos tarjetas comparten estilo, extraen un componente/clase base común.

---

## 11. Prohibiciones (Red Flags) 🚫

- Colores puros sin token: `red`, `blue`, `#000`, `#FFF`.
- Más de un gradiente de acento compitiendo en la misma vista.
- Diseños planos sin sombra/profundidad en superficies flotantes.
- Animaciones/saltos sin transición suave o sin respetar `reduced-motion`.
- `outline: none` sin un estado de foco alternativo.
- Estilos en línea no dinámicos.
- Mayúsculas forzadas (`text-transform: uppercase`) como recurso de jerarquía.
- Mezclar más de un radio de borde "familia" en la misma vista.

---

*Última actualización: mantener este documento versionado junto al código. Cualquier cambio de token pasa por revisión, ya que afecta a toda la aplicación.*
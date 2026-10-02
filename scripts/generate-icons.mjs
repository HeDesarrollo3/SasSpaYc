/**
 * scripts/generate-icons.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Generador de los iconos de la PWA. **Sin dependencias**: sólo `node:*`.
 *
 *   node --experimental-strip-types scripts/generate-icons.mjs   ← NO hace falta
 *   node scripts/generate-icons.mjs                              ← así se usa
 *
 * Por qué a mano y no con una librería (sharp, resvg, canvas…):
 *   la restricción del proyecto prohíbe añadir dependencias, y además `sharp`
 *   y `canvas` traen binarios nativos (otro motivo para no meterlos). Todo lo
 *   que hace falta lo da la stdlib:
 *
 *     · `node:zlib`       → deflate de los datos de la imagen (IDAT del PNG)
 *     · `zlib.crc32()`    → CRC32 de cada chunk (Node ≥ 20.15 / 22.2)
 *
 * PNG en 5 líneas de idea: firma + IHDR + IDAT + IEND, cada chunk con su
 * CRC32. Los datos crudos de la imagen son una fila por scanline, cada una
 * precedida de su byte de filtro (0 = None). RGBA de 8 bits = color type 6.
 *
 * Se emiten tres familias de icono (todas con el mismo dibujo: una hoja, que
 * es el motivo del favicon y lo más reconocible a 48 px):
 *
 *   icon.svg / icon-192.png / icon-512.png        purpose "any"
 *   icon-maskable.svg / -192 / -512               purpose "maskable" (fondo a
 *                                                 sangre y motivo dentro del
 *                                                 círculo seguro del 80 %)
 *   apple-touch-icon.png (180×180)                iOS: sin transparencia
 *
 * ⚠️ Los SVG y los PNG se generan **desde la misma geometría** de abajo
 * (`geometry()`), así que no pueden divergir. Si retocas la hoja, retoca la
 * geometría y vuelve a ejecutar el script; no edites los iconos a mano.
 */

import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/* ════════════════════════════════════════════════════════════════════════════
   PALETA — copiada de `src/index.css` (@theme). No inventar colores:
   si allí cambian los tokens de marca, hay que regenerar estos iconos.
   ════════════════════════════════════════════════════════════════════════════ */
const PALETTE = {
  bgBase: '#0B1120',       // --color-bg-base      → fondo de los maskable
  bgElevated: '#111827',   // --color-bg-elevated  → stop inferior del maskable
  accentFrom: '#6366F1',   // --color-accent-from  → inicio del degradado de la hoja
  accentTo: '#8B5CF6',     // --color-accent-to    → fin del degradado de la hoja
  white: '#FFFFFF',
};

/* ════════════════════════════════════════════════════════════════════════════
   GEOMETRÍA (espacio normalizado 0..1 de un cuadrado que se escala al tamaño)
   ════════════════════════════════════════════════════════════════════════════
   Hoja = dos cuadráticas que se encuentran en la punta (0.5, 0.03) y en la
   base (0.5, 0.97), más un nervio central. La "panza" es el punto de control
   (`ctrl`), que es lo que la hace más o menos redondeada.               */

const LEAF_CX = 0.5;
const LEAF_Y_TOP = 0.03;
const LEAF_Y_BOTTOM = 0.97;

/**
 * Punto de control de una cuadrática que va de la punta a la base tangenteando
 * la dirección `(dirX, dirY)` en la punta.
 *
 * ⚠️ Esto **no** es un detalle estético, es el motivo por el que la primera
 * versión de este script pintaba media hoja. Una cuadrática recorre un rango de
 * Y que depende del punto de control: si se elige "a ojo" (p. ej. `y = 0.5`
 * estando la punta en `0.03` y la base en `0.97`) la curva solo baja hasta
 * `y = 0.5` y la mitad inferior de la hoja no existe. Derivando el control
 * como `P0 + k·(dirección tangente)`, la curva recorre Y de punta a base
 * **siempre**, sea cual sea el largo de la hoja.
 */
function tangentControl(px, py, dirX, dirY, k, yLimit) {
  const norm = Math.hypot(dirX, dirY) || 1;
  const cx = px + (k * dirX) / norm;
  const cy = py + (k * dirY) / norm;
  return { x: cx, y: yLimit(cy) };
}

function geometry() {
  const cx = LEAF_CX;
  const yTop = LEAF_Y_TOP;
  const yBottom = LEAF_Y_BOTTOM;
  // La hoja llega justo a los extremos en X; el "ancho" lo fija `kPunta`.
  const kPunta = 0.34;
  const clamp01 = (value) => Math.min(1, Math.max(0, value));

  return {
    cx,
    yTop,
    yBottom,
    // Los dos arcos salen de la punta y mueren en la base superponiéndose en el
    // centro (`x = 0.5`): así el rasterizador solo necesita una X por fila.
    ctrlRight: tangentControl(cx, yTop, 1.2, 1, kPunta, clamp01),
    ctrlLeft: tangentControl(cx, yTop, -1.2, 1, kPunta, clamp01),
    /**
     * Nervio central: una banda vertical de ancho constante que se estrecha a
     * cero en los últimos `vein.fade` de la hoja (punta) y en el primer
     * `vein.fade` (base, para que la hoja acabe también en punta).
     *
     * ⚠️ Se modela como **perfil explícito** y no como dos cuadráticas espejo.
     * Con dos cuadráticas que salen y mueren en el eje, la lente resultante se
     * cierra en los dos extremos: el nervio quedaría estrechísimo abajo, al
     * revés que en una hoja real. El perfil `ancho(t)` da control directo y,
     * además, es el mismo que usa el SVG, así que ambos dibujos coinciden.
     */
    vein: {
      halfWidth: 0.032,
      fade: 0.22,
    },
    // Esquinas del cuadrado redondeado del fondo (0 = cuadrado, 0.5 = círculo).
    cornerRadius: 0.22,
    // Escala del motivo: el maskable necesita aire (círculo seguro del 80 %).
    scaleAny: 1.0,
    scaleMaskable: 0.70,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   SVG
   ════════════════════════════════════════════════════════════════════════════ */

const n = (value) => Number(value.toFixed(4));

/** Devuelve `{ defs, body }` para el contenido de un SVG de `size` px. */
function svgParts(size, { maskable }) {
  const g = geometry();
  const scale = maskable ? g.scaleMaskable : g.scaleAny;
  const radius = g.cornerRadius * size;

  const defs = `
    <linearGradient id="leaf" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0%" stop-color="${PALETTE.accentFrom}"/>
      <stop offset="100%" stop-color="${PALETTE.accentTo}"/>
    </linearGradient>${
      maskable
        ? `
    <linearGradient id="plate" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="${PALETTE.bgElevated}"/>
      <stop offset="100%" stop-color="${PALETTE.bgBase}"/>
    </linearGradient>`
        : ''
    }`;

  const plate = maskable
    ? `\n  <rect width="${size}" height="${size}" rx="${n(radius)}" fill="url(#plate)"/>`
    : '';

  /**
   * Nervio: contorno muestreado del perfil `veinHalfWidthAt` (el mismo que usa
   * el rasterizador, así que SVG y PNG no pueden divergir).
   */
  const VEIN_STEPS = 48;
  const veinPoints = [];
  for (let i = 0; i <= VEIN_STEPS; i += 1) {
    const t = i / VEIN_STEPS;
    const y = (1 - t) * g.yTop + t * g.yBottom;
    const half = veinHalfWidthAt(t, g);
    veinPoints.push([(g.cx - half) * size, y * size]);
  }
  for (let i = VEIN_STEPS; i >= 0; i -= 1) {
    const t = i / VEIN_STEPS;
    const y = (1 - t) * g.yTop + t * g.yBottom;
    const half = veinHalfWidthAt(t, g);
    veinPoints.push([(g.cx + half) * size, y * size]);
  }
  const veinPath = `M ${veinPoints.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L ')} Z`;

  const body = `${plate}
  <g transform="translate(${n(size / 2)} ${n(size / 2)}) scale(${n(size * scale)}) translate(${n(
    -size / 2,
  )} ${n(-size / 2)})">
    <path d="M ${n(g.cx * size)} ${n(g.yTop * size)}
             Q ${n(g.ctrlRight.x * size)} ${n(g.ctrlRight.y * size)} ${n(g.cx * size)} ${n(
               g.yBottom * size,
             )}
             Q ${n(g.ctrlLeft.x * size)} ${n(g.ctrlLeft.y * size)} ${n(g.cx * size)} ${n(
               g.yTop * size,
             )} Z"
          fill="url(#leaf)"/>
    <path d="${veinPath}" fill="${PALETTE.white}" fill-opacity="0.5"/>
  </g>`;

  return { defs, body };
}

function buildSvg(size, options) {
  const { defs, body } = svgParts(size, options);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Mi Spa">
  <defs>${defs}
  </defs>${body}
</svg>
`;
}

/* ════════════════════════════════════════════════════════════════════════════
   RASTERIZADO
   ════════════════════════════════════════════════════════════════════════════
   En vez de rellenar polígonos y recorrer scanlines, se evalúa cada píxel:
   para saber si un punto cae dentro de una cuadrática vertical se despeja el
   parámetro `t` a partir de la componente Y y se comprueba la X resultante.
   Es O(ancho × alto), apenas unas decenas de ms a 512 px, y evita escribir un
   rasterizador de curvas.                                              */

const SAMPLES = 2; // 2×2 muestras por píxel: antialiasing suficiente y ~5 s a 512 px

function mixColor(a, b, t) {
  const k = Math.min(1, Math.max(0, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function parseHex(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Parámetro `t` de la cuadrática en la fila `y` (o `NaN` si la curva no pasa
 * por ahí).
 *
 * El arco va de la punta (`t = 0`) a la base (`t = 1`), así que se busca la
 * raíz dentro de `[0, 1]`. Cada arco cubre Y de punta a base de forma
 * monótona (garantizado por `tangentControl`), así que hay **una sola** raíz
 * válida y no hay que decidir entre varias.
 */
function bezierTAtY(y, yFrom, yTo, yCtrl) {
  const y2 = yTo - 2 * yCtrl + yFrom;
  const y1 = 2 * (yCtrl - yFrom);
  const y0 = yFrom - y;
  if (Math.abs(y2) < 1e-12) {
    // La Y es lineal en `t` (control en el punto medio): solución directa.
    if (Math.abs(y1) < 1e-12) return Number.NaN;
    const t = -y0 / y1;
    return t >= -1e-6 && t <= 1 + 1e-6 ? t : Number.NaN;
  }
  const disc = y1 * y1 - 4 * y2 * y0;
  if (disc < 0) return Number.NaN;
  const sq = Math.sqrt(disc);
  const t1 = (-y1 + sq) / (2 * y2);
  const t2 = (-y1 - sq) / (2 * y2);
  const t = t1 >= -1e-6 && t1 <= 1 + 1e-6 ? t1 : t2;
  return t >= -1e-6 && t <= 1 + 1e-6 ? t : Number.NaN;
}

/** X de la cuadrática en el parámetro `t`. */
function bezierX(t, xFrom, xTo, xCtrl) {
  const u = 1 - t;
  return u * u * xFrom + 2 * u * t * xCtrl + t * t * xTo;
}

/** X de la cuadrática en la fila `y` (o `NaN`). */
function bezierXAtY(y, yFrom, yTo, yCtrl, xFrom, xTo, xCtrl) {
  const t = bezierTAtY(y, yFrom, yTo, yCtrl);
  return Number.isNaN(t) ? Number.NaN : bezierX(t, xFrom, xTo, xCtrl);
}

/**
 * Semiancho del nervio en el parámetro `t` (0 = punta de la hoja, 1 = base).
 *
 * Banda de ancho completo en el centro, cerrada por una rampa `smoothstep`
 * (suave también en los extremos de la rampa, sin el "codo" que deja una
 * parábola) de largo `vein.fade` en cada lado. En la punta vale 0 exacto.
 */
function veinHalfWidthAt(t, g) {
  let ramp = 1;
  if (t < g.vein.fade) ramp = t / g.vein.fade;
  else if (t > 1 - g.vein.fade) ramp = (1 - t) / g.vein.fade;
  const smooth = ramp * ramp * (3 - 2 * ramp);
  return g.vein.halfWidth * smooth;
}

/**
 * ¿El punto está dentro del nervio?
 *
 * El nervio es simétrico respecto al eje vertical, así que basta comparar la
 * distancia horizontal a `cx` con el perfil de ancho. Se reutiliza el `t` que
 * ya se despejó para los bordes: nada de muestrear la curva y buscar el punto
 * más cercano (ese primer intento dibujaba el nervio como una línea de puntos).
 */
function insideVein(x, y, g) {
  const t = bezierTAtY(y, g.yTop, g.yBottom, (g.yTop + g.yBottom) / 2);
  if (Number.isNaN(t)) return false;
  const halfWidth = veinHalfWidthAt(t, g);
  if (halfWidth <= 0) return false;
  return Math.abs(x - g.cx) <= halfWidth;
}

function insideRoundedSquare(x, y, size, radius) {
  const inset = radius;
  const cx = Math.min(Math.max(x, inset), size - inset);
  const cy = Math.min(Math.max(y, inset), size - inset);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius + 1e-9;
}

/**
 * Color + alfa de un punto en el espacio 0..1 (coordenadas absolutas de la
 * imagen, no normalizadas: el llamador ya dividió).
 */
function samplePixel(u, v, size, opts) {
  const g = geometry();
  const { maskable, scale } = opts;

  // Fondo
  let color;
  let alpha;
  if (maskable) {
    color = mixColor(parseHex(PALETTE.bgElevated), parseHex(PALETTE.bgBase), v);
    alpha = 1;
    if (!insideRoundedSquare(u * size, v * size, size, g.cornerRadius * size)) {
      alpha = 0;
      color = [0, 0, 0];
    }
  } else {
    color = [0, 0, 0];
    alpha = 0;
  }

  // El motivo se dibuja en un sistema centrado y escalado
  const mx = (u - 0.5) / scale + 0.5;
  const my = (v - 0.5) / scale + 0.5;
  if (mx < 0 || mx > 1 || my < 0 || my > 1) return [color[0], color[1], color[2], alpha];

  const leftX = bezierXAtY(my, g.yTop, g.yBottom, g.ctrlLeft.y, g.cx, g.cx, g.ctrlLeft.x);
  const rightX = bezierXAtY(my, g.yTop, g.yBottom, g.ctrlRight.y, g.cx, g.cx, g.ctrlRight.x);

  if (!Number.isNaN(leftX) && !Number.isNaN(rightX) && mx >= leftX && mx <= rightX) {
    const leaf = mixColor(parseHex(PALETTE.accentFrom), parseHex(PALETTE.accentTo), (my - g.yTop) / (g.yBottom - g.yTop));
    if (insideVein(mx, my, g)) {
      // Nervio: blanco al 50 % sobre el degradado, igual que en el SVG.
      color = mixColor(leaf, parseHex(PALETTE.white), 0.5);
    } else {
      color = leaf;
    }
    alpha = 1;
  }

  return [color[0], color[1], color[2], alpha];
}

function renderRgba(size, opts) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SAMPLES);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const u = (px * SAMPLES + sx + 0.5) * step;
          const v = (py * SAMPLES + sy + 0.5) * step;
          const [cr, cg, cb, ca] = samplePixel(u, v, size, opts);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const samples = SAMPLES * SAMPLES;
      const alpha = a / samples;
      const offset = (py * size + px) * 4;
      if (alpha > 0) {
        pixels[offset] = Math.round(r / a);
        pixels[offset + 1] = Math.round(g / a);
        pixels[offset + 2] = Math.round(b / a);
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

/* ════════════════════════════════════════════════════════════════════════════
   CODEC PNG
   ════════════════════════════════════════════════════════════════════════════ */

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData) >>> 0, 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);   // width
  ihdr.writeUInt32BE(size, 4);   // height
  ihdr[8] = 8;                   // bit depth
  ihdr[9] = 6;                   // color type: RGBA
  ihdr[10] = 0;                  // compression: deflate
  ihdr[11] = 0;                  // filter method
  ihdr[12] = 0;                  // interlace: none

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro None
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ════════════════════════════════════════════════════════════════════════════
   SALIDA
   ════════════════════════════════════════════════════════════════════════════ */

const TARGETS = [
  { file: 'icon.svg', kind: 'svg', size: 512, maskable: false },
  { file: 'icon-maskable.svg', kind: 'svg', size: 512, maskable: true },
  { file: 'icon-192.png', kind: 'png', size: 192, maskable: false },
  { file: 'icon-512.png', kind: 'png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', kind: 'png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', kind: 'png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', kind: 'png', size: 180, maskable: true },
];

function main() {
  mkdirSync(PUBLIC_DIR, { recursive: true });
  const written = [];

  for (const target of TARGETS) {
    const path = join(PUBLIC_DIR, target.file);
    const scale = target.maskable ? geometry().scaleMaskable : geometry().scaleAny;
    if (target.kind === 'svg') {
      writeFileSync(path, buildSvg(target.size, { maskable: target.maskable, scale }), 'utf8');
    } else {
      const pixels = renderRgba(target.size, { maskable: target.maskable, scale });
      writeFileSync(path, encodePng(target.size, pixels));
    }
    written.push(target.file);
  }

  console.log(`✔ ${written.length} iconos escritos en public/`);
  for (const file of written) console.log(`  · public/${file}`);
}

/**
 * Sólo se ejecuta al lanzarlo directamente (`node scripts/generate-icons.mjs`).
 * Al importarlo (para probar `geometry()` o `samplePixel()` desde fuera) no
 * escribe nada: evita reescribir la carpeta `public/` por accidente.
 */
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();

export {
  geometry,
  samplePixel,
  renderRgba,
  buildSvg,
  encodePng,
  bezierXAtY,
  bezierTAtY,
  veinHalfWidthAt,
  insideVein,
  TARGETS,
};

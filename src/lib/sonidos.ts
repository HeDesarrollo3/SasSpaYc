/**
 * Sonidos de aviso del sistema, **sintetizados** con la Web Audio API.
 *
 * ## Por qué sintetizados y no archivos
 * Un `.mp3` habría que generarlo, versionarlo y servirlo, y añade peso a la PWA.
 * Sintetizar dos notas son ~40 líneas, **cero dependencias** y cero bytes de
 * descarga. Además suena igual en cualquier dispositivo.
 *
 * ## ⚠️ Las dos trampas de este archivo, y cómo se resuelven
 *
 * ### 1. Los navegadores bloquean el audio sin gesto del usuario
 * Un `AudioContext` nace en estado `suspended` y **no suena** hasta que el usuario
 * interactúa con la página (política de *autoplay*). Si se creara y se intentara
 * sonar al cargar, fallaría en silencio.
 *
 * Solución: el contexto se crea en el **primer gesto** (`pointerdown`/`keydown`),
 * y `reproducirSonido()` sólo intenta sonar si ya está `running`. Si no lo está,
 * **no hace nada** — degradar en silencio es correcto: nunca debe romper la app
 * por no poder hacer *beep*.
 *
 * ### 2. Suena muchísimo
 * En una pantalla que se refresca sola cada 30 segundos, un sonido mal puesto
 * pita sin parar y el usuario lo desactiva en 5 minutos. **Este módulo no decide
 * cuándo suena** — sólo sabe sonar. Quien lo use debe llamarlo **sólo cuando
 * aparece un evento nuevo**, nunca en cada consulta. Eso lo resuelve
 * `useNotificacionSonora`, que compara con el valor anterior.
 */

export type TipoSonido = 'nuevo_servicio' | 'cobrado';

const CLAVE_PREFERENCIA = 'spa_sonidos_activos';

/** Un `AudioContext` por pestaña, creado a demanda. */
let contexto: AudioContext | null = null;

/** Nombre del constructor según el navegador (Safari antiguo usa `webkitAudioContext`). */
type VentanaConAudio = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

function ConstructorAudio(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as VentanaConAudio;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** ¿Este navegador puede sintetizar sonido? (En Node siempre es `false`.) */
export function sonidosDisponibles(): boolean {
  return ConstructorAudio() !== null;
}

/**
 * ¿El usuario quiere sonidos? Se guarda **por dispositivo**, no en el servidor:
 * es una preferencia de quién está delante de esa pantalla, no una regla del
 * negocio. Que el dueño los active en su PC no debe activárselos al cajero.
 */
export function sonidosActivos(): boolean {
  if (typeof localStorage === 'undefined') return false;
  // Por defecto **activados**: si nadie ha dicho lo contrario, el aviso sonoro es
  // la razón por la que existe esta función.
  return localStorage.getItem(CLAVE_PREFERENCIA) !== 'false';
}

export function setSonidosActivos(activo: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CLAVE_PREFERENCIA, String(activo));
}

/**
 * Crea (o reanuda) el contexto de audio. **Debe llamarse desde un gesto del
 * usuario** (`click`, `keydown`…), o el navegador lo dejará suspendido.
 *
 * Devuelve `true` si el audio quedó listo para sonar.
 */
export async function activarSonidos(): Promise<boolean> {
  const Ctor = ConstructorAudio();
  if (!Ctor) return false;

  try {
    contexto ??= new Ctor();
    if (contexto.state === 'suspended') await contexto.resume();
    return contexto.state === 'running';
  } catch {
    return false;
  }
}

/** Evita registrar el listener del primer gesto más de una vez. */
let gestoYaPreparado = false;

/**
 * Engancha la activación al **primer gesto** del usuario.
 *
 * Se registra una sola vez (el flag lo garantiza) y se quita sola: no queremos
 * un listener permanente en `document` sólo para esto.
 */
export function prepararSonidosConPrimerGesto(): void {
  if (typeof document === 'undefined' || gestoYaPreparado) return;
  gestoYaPreparado = true;

  const activar = () => {
    void activarSonidos();
    document.removeEventListener('pointerdown', activar);
    document.removeEventListener('keydown', activar);
  };
  document.addEventListener('pointerdown', activar, { once: true });
  document.addEventListener('keydown', activar, { once: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Síntesis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una nota con envolvente para que **no chasquee**.
 *
 * Un oscilador que empieza y acaba de golpe produce un clic audible (un salto
 * brusco en la onda). Por eso el volumen sube en ~15 ms y baja con una caída
 * exponencial: eso es lo que hace que suene a campana y no a golpe.
 */
function nota(
  ctx: AudioContext,
  frecuencia: number,
  inicio: number,
  duracion: number,
  volumen = 0.18,
): void {
  const osc = ctx.createOscillator();
  const gan = ctx.createGain();

  // `sine` suena limpio y amable; un `square` a este volumen resulta agresivo en
  // un spa, y el objetivo es avisar, no alarmar.
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frecuencia, inicio);

  const fin = inicio + duracion;
  gan.gain.setValueAtTime(0.0001, inicio);
  gan.gain.exponentialRampToValueAtTime(volumen, inicio + 0.015);
  gan.gain.exponentialRampToValueAtTime(0.0001, fin);

  osc.connect(gan);
  gan.connect(ctx.destination);
  osc.start(inicio);
  osc.stop(fin + 0.02);
}

/**
 * Reproduce un aviso. **Nunca lanza**: si el audio no está listo o el navegador
 * no lo soporta, simplemente no suena.
 *
 * @returns `true` si llegó a sonar.
 */
export function reproducirSonido(tipo: TipoSonido): boolean {
  if (!sonidosActivos()) return false;
  if (!contexto || contexto.state !== 'running') return false;

  try {
    const t = contexto.currentTime;
    if (tipo === 'nuevo_servicio') {
      // Dos notas ASCENDENTES (Mi5 → La5): subir transmite «entra algo nuevo»,
      // igual que un timbre de puerta. Es el aviso de que hay trabajo esperando.
      nota(contexto, 659.25, t, 0.28);
      nota(contexto, 880.0, t + 0.16, 0.42, 0.2);
    } else {
      // Una sola nota brillante y corta (Do6): confirma que algo se cerró bien.
      // Deliberadamente más suave que el anterior: cobrar es rutina, no alarma.
      nota(contexto, 1046.5, t, 0.22, 0.13);
    }
    return true;
  } catch {
    return false;
  }
}

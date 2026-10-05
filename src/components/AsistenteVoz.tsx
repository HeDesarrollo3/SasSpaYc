// src/components/AsistenteVoz.tsx
//
// Asistente de recepción por voz (fase 1).
//   · Voz → texto: Web Speech API del navegador (Chrome/Edge, es-CO). Gratis, sin
//     instalar nada. Chrome envía el audio a Google para transcribirlo; en la
//     fase local se cambia por Whisper en el PC del spa.
//   · El texto lo interpreta el backend (`POST /asistente/orden`), que responde,
//     muestra datos o PROPONE una acción. Nada se cobra ni se crea hasta que la
//     persona dice «sí» o toca «Confirmar» (lo verifica el servidor).
//   · Texto → voz: `speechSynthesis` del navegador.
// Si el navegador no tiene reconocimiento de voz, se puede escribir la orden.
//   · Manos libres (opcional): el navegador escucha en segundo plano y se activa
//     al oír la palabra clave («asistente» por defecto). «Asistente, ¿qué falta
//     por cobrar?» va directo; sólo «asistente» responde «Dime» y escucha.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Ear,
  EarOff,
  Loader2,
  Mic,
  MicOff,
  Play,
  Send,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import {
  AsistenteService,
  type AccionAsistente,
  type RespuestaAsistente,
} from '../services/asistente.service';
import { friendlyError } from '../utils/error-messages';

// ── Tipos mínimos de la Web Speech API (no vienen en lib.dom) ────────────────
type ResultadoVoz = { isFinal: boolean; 0: { transcript: string } };
type EventoVoz = { resultIndex: number; results: ArrayLike<ResultadoVoz> };
interface Reconocedor {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: EventoVoz) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type ConstructorReconocedor = new () => Reconocedor;

function constructorVoz(): ConstructorReconocedor | null {
  const w = window as unknown as {
    SpeechRecognition?: ConstructorReconocedor;
    webkitSpeechRecognition?: ConstructorReconocedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function leerPreferencia(clave: string, defecto: boolean): boolean {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? defecto : v === '1';
  } catch {
    return defecto;
  }
}
function guardarPreferencia(clave: string, valor: boolean) {
  try {
    localStorage.setItem(clave, valor ? '1' : '0');
  } catch {
    /* sin almacenamiento */
  }
}

export type Genero = 'femenina' | 'masculina';

/** Nombres de voces conocidas (Microsoft Edge, Windows, Google, Apple) por género. */
const FEMENINAS =
  /salome|dalia|elvira|paloma|helena|laura|sabina|paulina|monica|elena|camila|ximena|larissa|renata|beatriz|andrea|triana|abril|lia\b|vera|irene|esperanza|marisol|carlota|valentina|catalina|estrella|elsa|belkys|tatiana|karla|sofia|marta|lupe|penelope|conchita|mia\b|google espa/i;
const MASCULINAS =
  /gonzalo|jorge|alvaro|pablo|raul|gerardo|tomas|alonso|dario|emilio|arnau|saul|teo\b|diego|andres|carlos|juan|federico|liberto|cecilio|nil\b|yago|luciano|sebastian|mateo|alex|enrique|miguel|rodrigo|manuel|victor|jose/i;

export function generoDeVoz(v: SpeechSynthesisVoice): Genero | null {
  if (FEMENINAS.test(v.name)) return 'femenina';
  if (MASCULINAS.test(v.name)) return 'masculina';
  return null;
}

/** Las voces «Natural» / «Online» de Microsoft Edge suenan mucho más humanas. */
export function esNatural(v: SpeechSynthesisVoice): boolean {
  return /natural|online|neural|premium|enhanced/i.test(v.name);
}

/** Voces en español ordenadas: naturales primero, luego Colombia y Latinoamérica. */
export function vocesEspanol(): SpeechSynthesisVoice[] {
  const voces = (window.speechSynthesis?.getVoices() ?? []).filter((v) =>
    v.lang.toLowerCase().replace('_', '-').startsWith('es'),
  );
  const region = (v: SpeechSynthesisVoice) => {
    const l = v.lang.toLowerCase().replace('_', '-');
    return l === 'es-co'
      ? 0
      : ['es-mx', 'es-us', 'es-419'].includes(l)
        ? 1
        : l.startsWith('es-') && l !== 'es-es'
          ? 2
          : 3;
  };
  return voces.sort(
    (a, b) =>
      Number(esNatural(b)) - Number(esNatural(a)) ||
      region(a) - region(b) ||
      a.name.localeCompare(b.name),
  );
}

/** La voz elegida por nombre; si no existe, la mejor del género pedido. */
function elegirVoz(genero: Genero, nombre: string): SpeechSynthesisVoice | null {
  const voces = vocesEspanol();
  return (
    voces.find((v) => v.name === nombre) ??
    voces.find((v) => generoDeVoz(v) === genero) ??
    voces[0] ??
    null
  );
}

/** Nombre corto para mostrar: «Microsoft Salome Online (Natural) - Spanish (Colombia)» → «Salome · Colombia». */
function nombreCorto(v: SpeechSynthesisVoice): string {
  const pais = v.name.match(/\(([^)]+)\)\s*$/)?.[1] ?? v.lang;
  const base = v.name
    .replace(/^(Microsoft|Google)\s+/i, '')
    .replace(/\s*Online.*$|\s*-\s*Spanish.*$|\s*\(.*$/i, '')
    .trim();
  return `${base || v.name} · ${pais}${esNatural(v) ? ' ★' : ''}`;
}

/**
 * Hace que la lectura suene más natural: quita el «$», lee «CMD-2026…» como
 * «servicio», y separa en frases para que el navegador haga pausas.
 */
function prepararTexto(texto: string): string[] {
  const limpio = texto
    .replace(/\$/g, '')
    .replace(/\bCMD-\d{8}-0*(\d+)\b/g, 'servicio $1')
    .replace(/\s·\s/g, ', ')
    .replace(/«|»/g, '');
  return (
    limpio
      .match(/[^.?!;]+[.?!;]?/g)
      ?.map((f) => f.trim())
      .filter(Boolean) ?? [limpio]
  );
}

function leerTexto(clave: string, defecto: string): string {
  try {
    return localStorage.getItem(clave) || defecto;
  } catch {
    return defecto;
  }
}
function guardarTexto(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento */
  }
}

/** Minúsculas y sin tildes, para comparar la palabra clave. */
function plano(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca la palabra clave en lo transcrito y devuelve lo que se dijo después
 * («asistente qué falta por cobrar» → «qué falta por cobrar»), o `null`.
 * Para «asistente» acepta lo que suele transcribir mal: «a sistente», «asistenta».
 */
export function buscarPalabraClave(texto: string, palabra: string): string | null {
  const t = plano(texto);
  const p = plano(palabra);
  if (!p) return null;
  const variantes =
    p === 'asistente'
      ? ['asistente', 'a sistente', 'asistenta', 'asistentes', 'asistent', 'sistente']
      : [p];
  for (const v of variantes) {
    const i = t.indexOf(v);
    if (i >= 0 && (i === 0 || t[i - 1] === ' ')) {
      const original = texto.trim();
      // Se recorta sobre el texto original por número de palabras.
      const palabrasAntes = t.slice(0, i + v.length).split(' ').length;
      return original
        .split(/\s+/)
        .slice(palabrasAntes)
        .join(' ')
        .replace(/^[,.\s]+/, '');
    }
  }
  return null;
}

const SALUDOS = ['Dime.', 'Te escucho.', '¿En qué te ayudo?', 'Sí, dime.'];

type Turno =
  { quien: 'yo'; texto: string } | { quien: 'asistente'; r: RespuestaAsistente; error?: boolean };

export function AsistenteVoz() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const Voz = constructorVoz();

  const [abierto, setAbierto] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [pensando, setPensando] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [accion, setAccion] = useState<AccionAsistente | null>(null);
  const [vence, setVence] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const [escrito, setEscrito] = useState('');
  const [hablar, setHablar] = useState(() => leerPreferencia('asistente_hablar', true));
  const [manosLibres, setManosLibres] = useState(() =>
    leerPreferencia('asistente_manos_libres', false),
  );
  const [palabra, setPalabra] = useState(() => leerTexto('asistente_palabra', 'asistente'));
  const [genero, setGenero] = useState<Genero>(
    () => leerTexto('asistente_genero', 'femenina') as Genero,
  );
  const [vozNombre, setVozNombre] = useState(() => leerTexto('asistente_voz', ''));
  const [velocidad, setVelocidad] = useState(
    () => Number(leerTexto('asistente_velocidad', '1')) || 1,
  );
  const [ajustes, setAjustes] = useState(false);
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  const [vigilando, setVigilando] = useState(false);

  const reconocedor = useRef<Reconocedor | null>(null);
  const finalRef = useRef('');
  const finDeLista = useRef<HTMLDivElement | null>(null);
  const escucharTrasHablar = useRef(false);
  // Estado vivo para el vigía (sus callbacks no ven el estado de React actualizado).
  const vigia = useRef<Reconocedor | null>(null);
  const ocupado = useRef({ escuchando: false, pensando: false });
  ocupado.current = { escuchando, pensando };

  // Las voces del navegador llegan de forma asíncrona.
  useEffect(() => {
    const sintesis = window.speechSynthesis;
    if (!sintesis) return;
    const cargar = () => setVoces(vocesEspanol());
    cargar();
    sintesis.addEventListener?.('voiceschanged', cargar);
    return () => sintesis.removeEventListener?.('voiceschanged', cargar);
  }, []);

  useEffect(() => {
    finDeLista.current?.scrollIntoView({ block: 'end' });
  }, [turnos, parcial, accion]);

  // Cuenta atrás de la acción propuesta (la verdadera caducidad es la del servidor).
  useEffect(() => {
    if (!accion) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [accion]);
  const restante = Math.max(0, Math.round((vence - ahora) / 1000));
  useEffect(() => {
    if (accion && vence && ahora >= vence) setAccion(null);
  }, [ahora, vence, accion]);

  const decir = useCallback(
    (texto: string, luegoEscuchar = false) => {
      const sintesis = window.speechSynthesis;
      if (!hablar || !sintesis) {
        if (luegoEscuchar) escucharTrasHablar.current = true;
        return;
      }
      sintesis.cancel();
      const v = elegirVoz(genero, vozNombre);
      const frases = prepararTexto(texto);
      frases.forEach((frase, i) => {
        const u = new SpeechSynthesisUtterance(frase);
        if (v) u.voice = v;
        u.lang = v?.lang ?? 'es-CO';
        // Las voces naturales ya tienen buen ritmo; las clásicas suenan mejor un poco más lentas.
        u.rate = velocidad * (v && esNatural(v) ? 1 : 0.95);
        u.pitch = 1;
        if (luegoEscuchar && i === frases.length - 1) {
          u.onend = () => (escucharTrasHablar.current = true);
        }
        sintesis.speak(u);
      });
    },
    [hablar, genero, vozNombre, velocidad],
  );

  const procesar = useCallback(
    async (llamada: () => Promise<RespuestaAsistente>, textoUsuario?: string) => {
      if (textoUsuario) setTurnos((t) => [...t, { quien: 'yo', texto: textoUsuario }]);
      setPensando(true);
      try {
        const r = await llamada();
        setTurnos((t) => [...t.slice(-12), { quien: 'asistente', r }]);
        setAccion(r.accion ?? null);
        if (r.accion) {
          const t = Date.now();
          setAhora(t);
          setVence(t + r.accion.expira_en * 1000);
        }
        // Si propuso algo o hizo una pregunta, queda escuchando la respuesta.
        const espera = !!r.accion || r.respuesta.trim().endsWith('?');
        decir(r.respuesta, espera);
        if (r.navegar) navigate(r.navegar);
        if (r.ejecutada) qc.invalidateQueries();
      } catch (e) {
        const msg = friendlyError(e);
        setTurnos((t) => [...t, { quien: 'asistente', r: { respuesta: msg }, error: true }]);
        setAccion(null);
        decir(msg);
      } finally {
        setPensando(false);
      }
    },
    [decir, navigate, qc],
  );

  const enviarTexto = useCallback(
    (texto: string) => {
      const limpio = texto.trim();
      if (!limpio) return;
      void procesar(() => AsistenteService.orden(limpio), limpio);
    },
    [procesar],
  );

  const detener = useCallback(() => {
    reconocedor.current?.stop();
  }, []);

  const escuchar = useCallback(() => {
    if (!Voz || escuchando) return;
    window.speechSynthesis?.cancel();
    vigia.current?.abort();
    vigia.current = null;
    setVigilando(false);
    const rec = new Voz();
    rec.lang = 'es-CO';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    finalRef.current = '';
    rec.onresult = (e) => {
      let interino = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interino += r[0].transcript;
      }
      setParcial((finalRef.current + ' ' + interino).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setTurnos((t) => [
          ...t,
          {
            quien: 'asistente',
            r: {
              respuesta:
                'El navegador no tiene permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.',
            },
            error: true,
          },
        ]);
      }
    };
    rec.onend = () => {
      setEscuchando(false);
      const texto = finalRef.current.trim();
      setParcial('');
      if (texto) enviarTexto(texto);
    };
    reconocedor.current = rec;
    try {
      rec.start();
      setEscuchando(true);
    } catch {
      setEscuchando(false);
    }
  }, [Voz, escuchando, enviarTexto]);

  // Tras leer una pregunta o una propuesta, escucha la respuesta sin tocar nada.
  useEffect(() => {
    const t = setInterval(() => {
      if (escucharTrasHablar.current && !window.speechSynthesis?.speaking) {
        escucharTrasHablar.current = false;
        if (abierto && Voz) escuchar();
      }
    }, 250);
    return () => clearInterval(t);
  }, [abierto, Voz, escuchar]);

  // ── Manos libres: vigía que espera la palabra clave ─────────────────────
  const activarPorVoz = useCallback(
    (resto: string) => {
      setAbierto(true);
      if (resto.trim().split(/\s+/).length >= 2) {
        enviarTexto(resto);
      } else {
        const saludo = SALUDOS[Math.floor(Math.random() * SALUDOS.length)];
        setTurnos((t) => [...t.slice(-12), { quien: 'asistente', r: { respuesta: saludo } }]);
        decir(saludo, true);
      }
    },
    [enviarTexto, decir],
  );

  useEffect(() => {
    if (!manosLibres || !Voz) {
      vigia.current?.abort();
      vigia.current = null;
      setVigilando(false);
      return;
    }
    let vivo = true;
    const arrancar = () => {
      if (!vivo || vigia.current) return;
      const libre =
        !ocupado.current.escuchando &&
        !ocupado.current.pensando &&
        !window.speechSynthesis?.speaking &&
        !escucharTrasHablar.current &&
        document.visibilityState === 'visible';
      if (!libre) return;
      const rec = new Voz();
      rec.lang = 'es-CO';
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      let disparado = false;
      rec.onresult = (e) => {
        if (disparado) return;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const resto = buscarPalabraClave(r[0].transcript, palabra);
          if (resto === null) continue;
          // Con la palabra sola se activa ya; si viene una orden, se espera a
          // que termine la frase para no cortarla.
          if (!r.isFinal && resto.trim()) continue;
          disparado = true;
          rec.abort();
          vigia.current = null;
          setVigilando(false);
          activarPorVoz(resto);
          return;
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setManosLibres(false);
          guardarPreferencia('asistente_manos_libres', false);
        }
      };
      rec.onend = () => {
        if (vigia.current === rec) vigia.current = null;
        setVigilando(false);
      };
      vigia.current = rec;
      try {
        rec.start();
        setVigilando(true);
      } catch {
        vigia.current = null;
      }
    };
    // Chrome corta la escucha continua cada cierto tiempo: se reanuda sola.
    const t = setInterval(arrancar, 700);
    arrancar();
    return () => {
      vivo = false;
      clearInterval(t);
      vigia.current?.abort();
      vigia.current = null;
      setVigilando(false);
    };
  }, [manosLibres, Voz, palabra, activarPorVoz]);

  const alternarManosLibres = () => {
    const nuevo = !manosLibres;
    setManosLibres(nuevo);
    guardarPreferencia('asistente_manos_libres', nuevo);
    const msg = nuevo
      ? `Manos libres activado. Di «${palabra}» y luego tu orden.`
      : 'Manos libres desactivado.';
    setTurnos((t) => [...t.slice(-12), { quien: 'asistente', r: { respuesta: msg } }]);
    decir(msg);
  };

  // Al cerrar el panel se calla y deja de escuchar.
  useEffect(() => {
    if (abierto) return;
    reconocedor.current?.abort();
    window.speechSynthesis?.cancel();
    escucharTrasHablar.current = false;
  }, [abierto]);

  const pulsarBoton = () => {
    if (!abierto) {
      setAbierto(true);
      if (Voz) setTimeout(escuchar, 50);
      return;
    }
    if (escuchando) detener();
    else if (Voz) escuchar();
  };

  const confirmar = () =>
    accion && procesar(() => AsistenteService.confirmar(accion.id), 'Confirmar');
  const cancelar = () => accion && procesar(() => AsistenteService.cancelar(accion.id), 'Cancelar');

  const alternarVoz = () => {
    const nuevo = !hablar;
    setHablar(nuevo);
    guardarPreferencia('asistente_hablar', nuevo);
    if (!nuevo) window.speechSynthesis?.cancel();
  };

  const enviarFormulario = (e: FormEvent) => {
    e.preventDefault();
    enviarTexto(escrito);
    setEscrito('');
  };

  return (
    <>
      {abierto && (
        <section
          role="dialog"
          aria-label="Asistente de recepción"
          className="fixed top-[72px] right-4 z-50 flex max-h-[min(75vh,640px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-card shadow-2xl"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Sparkles size={16} className="text-accent-from" aria-hidden="true" />
              Asistente
            </h2>
            <div className="flex gap-1">
              <button
                type="button"
                className={`btn-icon ${ajustes ? 'text-accent-from' : ''}`}
                onClick={() => setAjustes((a) => !a)}
                aria-pressed={ajustes}
                aria-label="Ajustes de voz"
                title="Ajustes de voz"
              >
                <Settings2 size={16} />
              </button>
              {Voz && (
                <button
                  type="button"
                  className={`btn-icon ${manosLibres ? 'text-accent-from' : ''}`}
                  onClick={alternarManosLibres}
                  aria-pressed={manosLibres}
                  aria-label={manosLibres ? 'Desactivar manos libres' : 'Activar manos libres'}
                  title={manosLibres ? `Manos libres: di «${palabra}»` : 'Activar manos libres'}
                >
                  {manosLibres ? <Ear size={16} /> : <EarOff size={16} />}
                </button>
              )}
              <button
                type="button"
                className="btn-icon"
                onClick={alternarVoz}
                aria-label={hablar ? 'Silenciar respuestas' : 'Leer respuestas en voz alta'}
                title={hablar ? 'Silenciar' : 'Activar voz'}
              >
                {hablar ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar asistente"
              >
                <X size={16} />
              </button>
            </div>
          </header>

          {ajustes && (
            <div className="space-y-3 border-b border-border-subtle bg-accent-from/5 px-4 py-3 text-xs">
              <fieldset>
                <legend className="mb-1 font-semibold text-text-secondary">Voz</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['femenina', 'masculina'] as Genero[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={genero === g}
                      onClick={() => {
                        setGenero(g);
                        guardarTexto('asistente_genero', g);
                        // Al cambiar de género se usa la mejor voz de ese género.
                        setVozNombre('');
                        guardarTexto('asistente_voz', '');
                      }}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        genero === g
                          ? 'border-accent-from bg-accent-from text-on-accent font-semibold'
                          : 'border-border-subtle text-text-primary'
                      }`}
                    >
                      {g === 'femenina' ? 'Femenina' : 'Masculina'}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div>
                <label
                  htmlFor="asistente-voz"
                  className="mb-1 block font-semibold text-text-secondary"
                >
                  Voz exacta
                </label>
                <select
                  id="asistente-voz"
                  className="select h-9 min-h-0 py-1 text-xs"
                  value={vozNombre}
                  onChange={(e) => {
                    setVozNombre(e.target.value);
                    guardarTexto('asistente_voz', e.target.value);
                  }}
                >
                  <option value="">La mejor {genero} disponible</option>
                  {voces
                    .filter((v) => generoDeVoz(v) === genero || generoDeVoz(v) === null)
                    .map((v) => (
                      <option key={v.name} value={v.name}>
                        {nombreCorto(v)}
                      </option>
                    ))}
                </select>
                {!voces.some(esNatural) && (
                  <p className="mt-1 text-text-muted">
                    Para voces más humanas abre el sistema en Microsoft Edge: trae voces «Natural»
                    de Colombia (Salomé y Gonzalo), gratis.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor="asistente-velocidad"
                  className="shrink-0 font-semibold text-text-secondary"
                >
                  Velocidad
                </label>
                <input
                  id="asistente-velocidad"
                  type="range"
                  min={0.8}
                  max={1.3}
                  step={0.05}
                  value={velocidad}
                  onChange={(e) => {
                    setVelocidad(Number(e.target.value));
                    guardarTexto('asistente_velocidad', e.target.value);
                  }}
                  className="flex-1 accent-[var(--color-accent-from)]"
                />
                <button
                  type="button"
                  className="btn-ghost h-8 min-h-0 px-2 text-xs"
                  onClick={() => {
                    const forzar = !hablar;
                    if (forzar) setHablar(true);
                    setTimeout(
                      () =>
                        decir('Hola, soy tu asistente. Hoy llevan 350.000 pesos en cuatro ventas.'),
                      forzar ? 50 : 0,
                    );
                  }}
                >
                  <Play size={14} aria-hidden="true" /> Probar
                </button>
              </div>
            </div>
          )}

          {manosLibres && (
            <div className="flex items-center gap-2 border-b border-border-subtle bg-accent-from/5 px-4 py-2 text-xs text-text-secondary">
              <span
                className={`size-2 shrink-0 rounded-full ${vigilando ? 'animate-pulse bg-accent-from' : 'bg-border-strong'}`}
                aria-hidden="true"
              />
              <label htmlFor="asistente-palabra" className="shrink-0">
                Se activa al decir
              </label>
              <input
                id="asistente-palabra"
                className="input h-8 min-h-0 flex-1 px-2 py-1 text-xs"
                value={palabra}
                onChange={(e) => setPalabra(e.target.value)}
                onBlur={() => {
                  const limpia = palabra.trim() || 'asistente';
                  setPalabra(limpia);
                  guardarTexto('asistente_palabra', limpia);
                }}
              />
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
            {turnos.length === 0 && !parcial && (
              <div className="text-body-sm text-text-secondary">
                <p className="font-semibold text-text-primary">Háblame o escríbeme.</p>
                <p className="mt-1">
                  Por ejemplo: «¿qué falta por cobrar?», «cobra lo de Camila en efectivo», «¿cuánto
                  llevamos hoy?». Di «ayuda» para ver todo.
                </p>
                {!Voz && (
                  <p className="mt-2 text-text-muted">
                    Este navegador no reconoce voz: usa Chrome o Edge, o escribe la orden abajo.
                  </p>
                )}
              </div>
            )}

            {turnos.map((t, i) =>
              t.quien === 'yo' ? (
                <p
                  key={i}
                  className="ml-auto w-fit max-w-[85%] rounded-lg bg-accent-from px-3 py-2 text-sm text-on-accent"
                >
                  {t.texto}
                </p>
              ) : (
                <div key={i} className="max-w-[95%] space-y-2">
                  <p
                    className={`w-fit rounded-lg border px-3 py-2 text-sm ${
                      t.error
                        ? 'border-danger-line bg-danger-soft text-danger-text'
                        : 'border-border-subtle text-text-primary'
                    }`}
                  >
                    {t.r.respuesta}
                  </p>
                  {t.r.lista && t.r.lista.items.length > 0 && (
                    <div className="rounded-md border border-border-subtle">
                      <p className="border-b border-border-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary">
                        {t.r.lista.titulo}
                      </p>
                      <ul className="divide-y divide-border-subtle">
                        {t.r.lista.items.map((it, j) => {
                          const elegible =
                            t.r.lista?.titulo === '¿Cuál?' && i === turnos.length - 1;
                          const contenido = (
                            <>
                              <span className="min-w-0">
                                <span className="block text-sm text-text-primary">
                                  {it.etiqueta}
                                </span>
                                {it.detalle && (
                                  <span className="block text-xs text-text-muted">
                                    {it.detalle}
                                  </span>
                                )}
                              </span>
                              {it.valor && (
                                <span className="tabular shrink-0 text-sm font-semibold text-text-primary">
                                  {it.valor}
                                </span>
                              )}
                            </>
                          );
                          return (
                            <li key={j}>
                              {elegible ? (
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-card-hover"
                                  onClick={() => enviarTexto(`el ${j + 1}`)}
                                >
                                  {contenido}
                                </button>
                              ) : (
                                <div className="flex items-center justify-between gap-3 px-3 py-2">
                                  {contenido}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              ),
            )}

            {accion && (
              <div className="rounded-md border-2 border-accent-from p-3">
                <p className="text-sm font-semibold text-text-primary">{accion.resumen}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  {accion.detalles.map((d) => (
                    <div key={d.etiqueta} className="contents">
                      <dt className="text-text-muted">{d.etiqueta}</dt>
                      <dd className="text-right text-text-primary">{d.valor}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-ghost flex-1 text-sm"
                    onClick={cancelar}
                    disabled={pensando}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary flex-1 text-sm"
                    onClick={confirmar}
                    disabled={pensando}
                  >
                    <Check size={16} aria-hidden="true" /> Confirmar
                  </button>
                </div>
                <p className="mt-2 text-center text-xs text-text-muted">
                  Di «sí» o «no» · vence en {restante} s
                </p>
              </div>
            )}

            {parcial && (
              <p className="ml-auto w-fit max-w-[85%] rounded-lg border border-dashed border-accent-from px-3 py-2 text-sm text-text-secondary">
                {parcial}…
              </p>
            )}
            {pensando && (
              <p className="flex items-center gap-2 text-xs text-text-muted">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Pensando…
              </p>
            )}
            <div ref={finDeLista} />
          </div>

          <form
            onSubmit={enviarFormulario}
            className="flex items-center gap-2 border-t border-border-subtle p-3"
          >
            <label htmlFor="asistente-texto" className="sr-only">
              Escribe una orden
            </label>
            <input
              id="asistente-texto"
              className="input flex-1"
              placeholder={escuchando ? 'Escuchando…' : 'Escribe o pulsa el micrófono'}
              autoComplete="off"
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
            />
            <button
              type="submit"
              className="btn-icon"
              aria-label="Enviar"
              disabled={!escrito.trim() || pensando}
            >
              <Send size={16} />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={pulsarBoton}
        aria-label={
          escuchando
            ? 'Dejar de escuchar'
            : abierto
              ? 'Hablar al asistente'
              : 'Abrir asistente de voz'
        }
        title="Asistente de voz"
        className={`relative flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-transform active:scale-95 ${
          escuchando
            ? 'animate-pulse bg-danger-text text-white'
            : 'bg-accent-from text-on-accent hover:opacity-90'
        }`}
      >
        {escuchando ? (
          <MicOff size={18} aria-hidden="true" />
        ) : (
          <Mic size={18} aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{escuchando ? 'Escuchando' : 'Asistente'}</span>
        {vigilando && !escuchando && (
          <span
            className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-card bg-success-text"
            title={`Manos libres: di «${palabra}»`}
            aria-hidden="true"
          />
        )}
      </button>
    </>
  );
}

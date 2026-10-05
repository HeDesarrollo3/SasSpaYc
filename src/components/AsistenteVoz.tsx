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
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from 'lucide-react';

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

/** Voz en español, preferiblemente latinoamericana. */
function vozEspanol(): SpeechSynthesisVoice | null {
  const voces = window.speechSynthesis?.getVoices() ?? [];
  const orden = ['es-CO', 'es-MX', 'es-US', 'es-419', 'es-ES', 'es'];
  for (const lang of orden) {
    const v = voces.find((x) =>
      x.lang.replace('_', '-').toLowerCase().startsWith(lang.toLowerCase()),
    );
    if (v) return v;
  }
  return null;
}

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

  const reconocedor = useRef<Reconocedor | null>(null);
  const finalRef = useRef('');
  const finDeLista = useRef<HTMLDivElement | null>(null);
  const escucharTrasHablar = useRef(false);

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
      const u = new SpeechSynthesisUtterance(texto.replace(/\$/g, ''));
      const v = vozEspanol();
      if (v) u.voice = v;
      u.lang = v?.lang ?? 'es-CO';
      u.rate = 1.05;
      if (luegoEscuchar) u.onend = () => (escucharTrasHablar.current = true);
      sintesis.speak(u);
    },
    [hablar],
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
        className={`flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-transform active:scale-95 ${
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
      </button>
    </>
  );
}

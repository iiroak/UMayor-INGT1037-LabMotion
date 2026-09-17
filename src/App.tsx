import { useEffect, useRef, useState } from "react";
import { KinematicsChart, StripChart, type SensorChartMode } from "./components/StripChart";
import { Modal, TopAlert } from "./components/ui";
import { getDiagnostics, diagnosticsText, type Diagnostics } from "./lib/diagnostics";
import { copyText, downloadMeasurementCsv, downloadMeasurementJson } from "./lib/export";
import { deriveXAxisKinematics, summarizeMeasurement, type MeasurementSummary } from "./lib/kinematics";
import {
  axisMagnitude,
  getSensorCapabilities,
  primaryAcceleration,
  primaryAccelerationIncludesGravity,
  requestMotionPermission,
  subscribeToSensors,
  type MotionSample,
  type SensorCapabilities,
  type SensorState,
} from "./lib/sensors";

type Tab = "live" | "measure" | "charts" | "diagnostics";

type Experiment = {
  id: string;
  name: string;
  description: string;
  question: string;
};

type Measurement = {
  experiment: Experiment;
  samples: MotionSample[];
  summary: MeasurementSummary;
};

type ScreenLock = {
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenLock>;
  };
};

const EXPERIMENTS: Experiment[] = [
  {
    id: "rest",
    name: "Reposo y orientación",
    description: "Deja el teléfono quieto y cambia lentamente su orientación.",
    question: "¿Qué componente de la gravedad aparece en cada eje?",
  },
  {
    id: "acceleration",
    name: "Aceleración rectilínea",
    description: "Mueve el teléfono en una dirección durante algunos segundos.",
    question: "¿Cómo cambia la aceleración cuando comienza el movimiento?",
  },
  {
    id: "braking",
    name: "Aceleración y frenado",
    description: "Acelera y detén el teléfono o un carrito donde esté montado.",
    question: "¿Se distingue el impulso de la detención en el gráfico?",
  },
  {
    id: "incline",
    name: "Plano inclinado",
    description: "Desliza el teléfono sobre una superficie con inclinación controlada.",
    question: "¿La aceleración cambia al modificar el ángulo?",
  },
  {
    id: "oscillation",
    name: "Movimiento oscilatorio",
    description: "Realiza un movimiento de ida y vuelta manteniendo un ritmo estable.",
    question: "¿Se puede estimar un período a partir de los máximos?",
  },
];

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: "live", label: "En vivo", description: "Lectura instantánea" },
  { id: "measure", label: "Medir", description: "Guardar una corrida" },
  { id: "charts", label: "Gráficos", description: "Interpretar datos" },
  { id: "diagnostics", label: "Diagnóstico", description: "Verificar el teléfono" },
];

function formatValue(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatDuration(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function statusLabel(state: SensorState): string {
  if (state === "active") return "Sensores activos";
  if (state === "requesting") return "Solicitando acceso";
  if (state === "denied") return "Permiso rechazado";
  if (state === "unsupported") return "No compatible";
  if (state === "error") return "Revisar conexión";
  return "Listo para probar";
}

function announceMessage(
  setNotice: (message: string) => void,
  setNoticeError: (error: boolean) => void,
  message: string,
  error = false,
): void {
  setNotice(message);
  setNoticeError(error);
}

function SensorGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <circle cx="12" cy="12" r="5" />
      <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckGlyph({ checked }: { checked: boolean }) {
  return (
    <span className={`check-glyph${checked ? " checked" : ""}`} aria-hidden="true">
      {checked ? "OK" : "-"}
    </span>
  );
}

function ReadingTile({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number | null;
  unit: string;
  accent: "blue" | "orange" | "green" | "purple";
}) {
  return (
    <div className={`reading-tile reading-tile-${accent}`}>
      <span>{label}</span>
      <strong>{formatValue(value)}</strong>
      <small>{unit}</small>
    </div>
  );
}

function TabNavigation({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="tab-navigation" aria-label="Secciones de LabMotion" role="tablist">
      {TABS.map((tab) => (
        <button
          className={`tab-button${activeTab === tab.id ? " active" : ""}`}
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
        >
          <strong>{tab.label}</strong>
          <span>{tab.description}</span>
        </button>
      ))}
    </nav>
  );
}

function SensorStatusCard({
  state,
  capabilities,
  error,
  onEnable,
}: {
  state: SensorState;
  capabilities: SensorCapabilities;
  error: string;
  onEnable: () => void;
}) {
  const isActive = state === "active";
  return (
    <section className="sensor-status-card">
      <div className="sensor-status-heading">
        <span className={`status-dot${isActive ? " active" : ""}`} aria-hidden="true" />
        <div>
          <span className="eyebrow">Estado del instrumento</span>
          <strong>{statusLabel(state)}</strong>
        </div>
      </div>
      <p>
        {isActive
          ? "El teléfono está enviando mediciones al navegador."
          : "Activa el acceso para comenzar a observar datos reales."}
      </p>
      {error ? <p className="inline-error">{error}</p> : null}
      <div className="sensor-status-meta">
        <span className={capabilities.secureContext ? "ok" : "err"}>
          {capabilities.secureContext ? "HTTPS activo" : "Se requiere HTTPS"}
        </span>
        <span>{capabilities.deviceMotion ? "DeviceMotion detectado" : "DeviceMotion no detectado"}</span>
      </div>
      {!isActive ? (
        <button className="primary status-button" type="button" onClick={onEnable} disabled={state === "requesting"}>
          {state === "requesting" ? "Solicitando..." : "Activar sensores"}
          <ArrowGlyph />
        </button>
      ) : null}
    </section>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("live");
  const [sensorState, setSensorState] = useState<SensorState>("idle");
  const [sensorError, setSensorError] = useState("");
  const [latest, setLatest] = useState<MotionSample | null>(null);
  const [liveSamples, setLiveSamples] = useState<MotionSample[]>([]);
  const [effectiveFrequencyHz, setEffectiveFrequencyHz] = useState<number | null>(null);
  const [selectedExperimentId, setSelectedExperimentId] = useState("braking");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [chartMode, setChartMode] = useState<SensorChartMode>("acceleration");
  const [showHelp, setShowHelp] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const capabilities = useRef<SensorCapabilities | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const liveSamplesRef = useRef<MotionSample[]>([]);
  const sampleTimesRef = useRef<number[]>([]);
  const recordingSamplesRef = useRef<MotionSample[]>([]);
  const recordingRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const lastUiUpdateAtRef = useRef(0);
  const wakeLockRef = useRef<ScreenLock | null>(null);

  if (capabilities.current === null) capabilities.current = getSensorCapabilities();
  const deviceCapabilities = capabilities.current;
  const selectedExperiment = EXPERIMENTS.find((item) => item.id === selectedExperimentId) ?? EXPERIMENTS[0];
  const chartSamples = measurement?.samples ?? liveSamples;
  const kinematicPoints = measurement ? deriveXAxisKinematics(measurement.samples) : [];
  const diagnostics: Diagnostics = getDiagnostics(
    deviceCapabilities,
    sensorState,
    effectiveFrequencyHz,
    latest?.intervalMs ?? null,
  );

  function showNotice(message: string, error = false): void {
    announceMessage(setNotice, setNoticeError, message, error);
    window.setTimeout(() => {
      setNotice((current) => (current === message ? "" : current));
    }, 5200);
  }

  async function requestScreenLock(): Promise<void> {
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLock) return;
    try {
      wakeLockRef.current = await wakeLock.request("screen");
    } catch {
      // A browser can reject the lock without affecting sensor capture.
    }
  }

  async function releaseScreenLock(): Promise<void> {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock) await lock.release();
  }

  async function enableSensors(): Promise<boolean> {
    if (sensorState === "active" && unsubscribeRef.current) return true;
    setSensorState("requesting");
    setSensorError("");
    const permission = await requestMotionPermission();

    if (permission === "insecure") {
      setSensorState("error");
      setSensorError("Abre la dirección HTTPS de LabMotion para usar sensores.");
      return false;
    }
    if (permission === "unsupported") {
      setSensorState("unsupported");
      setSensorError("Este navegador no expone DeviceMotionEvent.");
      return false;
    }
    if (permission === "denied") {
      setSensorState("denied");
      setSensorError("El permiso fue rechazado. Revisa los permisos del sitio y vuelve a intentar.");
      return false;
    }

    unsubscribeRef.current?.();
    unsubscribeRef.current = subscribeToSensors((sample) => {
      const liveBuffer = liveSamplesRef.current;
      liveBuffer.push(sample);
      if (liveBuffer.length > 720) liveBuffer.splice(0, liveBuffer.length - 720);

      const sampleTimes = sampleTimesRef.current;
      sampleTimes.push(sample.tMs);
      while (sampleTimes.length > 2 && sample.tMs - sampleTimes[0] > 1000) sampleTimes.shift();

      if (recordingRef.current && recordingSamplesRef.current.length < 3600) {
        recordingSamplesRef.current.push(sample);
      }

      const now = performance.now();
      if (now - lastUiUpdateAtRef.current >= 80) {
        lastUiUpdateAtRef.current = now;
        setLatest(sample);
        setLiveSamples([...liveBuffer]);
        if (sampleTimes.length > 1) {
          const elapsed = sampleTimes[sampleTimes.length - 1] - sampleTimes[0];
          setEffectiveFrequencyHz(elapsed > 0 ? ((sampleTimes.length - 1) / elapsed) * 1000 : null);
        }
      }
    });
    setSensorState("active");
    return true;
  }

  async function startMeasurement(): Promise<void> {
    const ready = sensorState === "active" || await enableSensors();
    if (!ready) return;
    recordingSamplesRef.current = [];
    recordingStartedAtRef.current = performance.now();
    recordingRef.current = true;
    setMeasurement(null);
    setRecordingElapsedMs(0);
    setIsRecording(true);
    await requestScreenLock();
    showNotice("Medición iniciada. Realiza el movimiento y luego presiona detener.");
  }

  async function stopMeasurement(): Promise<void> {
    recordingRef.current = false;
    const capturedSamples = recordingSamplesRef.current.slice();
    const durationMs = performance.now() - recordingStartedAtRef.current;
    setIsRecording(false);
    await releaseScreenLock();

    if (capturedSamples.length < 2) {
      showNotice("No llegaron suficientes muestras. Mantén el teléfono activo y prueba otra vez.", true);
      return;
    }

    const summary = summarizeMeasurement(capturedSamples);
    setMeasurement({
      experiment: selectedExperiment,
      samples: capturedSamples,
      summary: { ...summary, durationMs },
    });
    setActiveTab("charts");
    showNotice(`${capturedSamples.length} muestras guardadas localmente.`);
  }

  async function copyDiagnostics(): Promise<void> {
    const copied = await copyText(diagnosticsText(diagnostics));
    showNotice(copied ? "Diagnóstico copiado al portapapeles." : "No se pudo copiar el diagnóstico.", !copied);
  }

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      void releaseScreenLock();
    };
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      setRecordingElapsedMs(performance.now() - recordingStartedAtRef.current);
    }, 100);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void requestScreenLock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isRecording]);

  return (
    <div className="app-shell">
      <TopAlert message={notice} error={noticeError} />
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark"><SensorGlyph /></span>
          <div>
            <strong>LabMotion</strong>
            <span>Movimiento y cinemática</span>
          </div>
        </div>
        <div className={`header-status${sensorState === "active" ? " active" : ""}`}>
          <span className="status-dot" aria-hidden="true" />
          {statusLabel(sensorState)}
        </div>
      </header>

      <main className="labmotion-main">
        <section className="intro-grid">
          <div className="intro-copy">
            <span className="eyebrow">Prototipo de factibilidad · Grupo 1</span>
            <h1>Haz visible el movimiento.</h1>
            <p>
              Un laboratorio portátil para observar cómo un smartphone convierte aceleración,
              rotación y tiempo en datos de cinemática.
            </p>
            <div className="intro-pills">
              <span><span className="pill-dot pill-dot-blue" />Sin aplicación</span>
              <span><span className="pill-dot pill-dot-orange" />Sin backend</span>
              <span><span className="pill-dot pill-dot-green" />Datos locales</span>
            </div>
          </div>
          <SensorStatusCard
            state={sensorState}
            capabilities={deviceCapabilities}
            error={sensorError}
            onEnable={() => void enableSensors()}
          />
        </section>

        <TabNavigation activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "live" ? (
          <section className="tab-content" role="tabpanel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Observación directa</span>
                <h2>Datos en vivo</h2>
              </div>
              <span className="badge">{effectiveFrequencyHz ? `${effectiveFrequencyHz.toFixed(1)} Hz` : "Esperando datos"}</span>
            </div>

            <section className="card readings-card">
              <div className="card-heading">
                <div>
                  <h3>Aceleración lineal</h3>
                  <p>{latest && primaryAccelerationIncludesGravity(latest) ? "Fallback: incluye gravedad" : "m/s2 en los tres ejes"}</p>
                </div>
                <span className="live-indicator"><span /> LIVE</span>
              </div>
              <div className="reading-grid">
                <ReadingTile label="Eje X" value={latest ? primaryAcceleration(latest).x : null} unit="m/s2" accent="blue" />
                <ReadingTile label="Eje Y" value={latest ? primaryAcceleration(latest).y : null} unit="m/s2" accent="orange" />
                <ReadingTile label="Eje Z" value={latest ? primaryAcceleration(latest).z : null} unit="m/s2" accent="green" />
                <ReadingTile label="Magnitud" value={latest ? axisMagnitude(primaryAcceleration(latest)) : null} unit="m/s2" accent="purple" />
              </div>
            </section>

            <section className="card chart-card">
              <div className="card-heading">
                <div>
                  <h3>Señal del acelerómetro</h3>
                  <p>Últimas muestras recibidas en el navegador</p>
                </div>
                <div className="chart-legend" aria-label="Leyenda del gráfico">
                  <span><i className="legend-blue" /> X</span>
                  <span><i className="legend-orange" /> Y</span>
                  <span><i className="legend-green" /> Z</span>
                </div>
              </div>
              <div className="chart-frame">
                <StripChart samples={liveSamples} mode="acceleration" />
              </div>
              <div className="chart-footnote">
                <span>El gráfico confirma que el teléfono entrega una señal variable.</span>
                <span>Ventana: últimos 720 puntos</span>
              </div>
            </section>

            <div className="two-column-grid">
              <section className="card compact-card">
                <div className="card-heading">
                  <div>
                    <h3>Velocidad angular</h3>
                    <p>Giroscopio · grados por segundo</p>
                  </div>
                  <span className="mini-symbol">gyro</span>
                </div>
                <div className="mini-readings">
                  <span><b>alpha</b><strong>{formatValue(latest?.rotationRate.x ?? null, 1)}</strong></span>
                  <span><b>beta</b><strong>{formatValue(latest?.rotationRate.y ?? null, 1)}</strong></span>
                  <span><b>gamma</b><strong>{formatValue(latest?.rotationRate.z ?? null, 1)}</strong></span>
                </div>
              </section>
              <section className="card compact-card signal-card">
                <span className="eyebrow">Cadena experimental</span>
                <div className="signal-flow">
                  <span>Sensor</span><ArrowGlyph /><span>Datos</span><ArrowGlyph /><span>Gráfico</span>
                </div>
                <p>El teléfono funciona como instrumento, no sólo como pantalla.</p>
              </section>
            </div>
          </section>
        ) : null}

        {activeTab === "measure" ? (
          <section className="tab-content" role="tabpanel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Experiencia de laboratorio</span>
                <h2>Capturar una corrida</h2>
              </div>
              <span className="badge">Todo queda en este teléfono</span>
            </div>

            <section className="card experiment-card">
              <div className="card-heading">
                <div>
                  <h3>Elige el fenómeno</h3>
                  <p>Este prototipo usa una misma instrumentación para varias experiencias.</p>
                </div>
                <button className="text-button" type="button" onClick={() => setShowHelp(true)}>¿Cómo funciona?</button>
              </div>
              <label className="field-label" htmlFor="experiment">Experimento</label>
              <select
                className="experiment-select"
                id="experiment"
                value={selectedExperimentId}
                onChange={(event) => setSelectedExperimentId(event.target.value)}
                disabled={isRecording}
              >
                {EXPERIMENTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <div className="experiment-description">
                <span className="experiment-index">01</span>
                <div>
                  <strong>{selectedExperiment.description}</strong>
                  <p>{selectedExperiment.question}</p>
                </div>
              </div>
              <div className={`recording-panel${isRecording ? " recording" : ""}`}>
                <div>
                  <span className="eyebrow">{isRecording ? "Capturando" : "Listo para capturar"}</span>
                  <strong>{isRecording ? formatDuration(recordingElapsedMs) : "00.0 s"}</strong>
                </div>
                <div className="recording-actions">
                  {isRecording ? (
                    <button className="primary recording-stop" type="button" onClick={() => void stopMeasurement()}>
                      <span className="stop-square" /> Detener medición
                    </button>
                  ) : (
                    <button className="primary" type="button" onClick={() => void startMeasurement()}>
                      <span className="record-dot" /> Iniciar medición
                    </button>
                  )}
                </div>
              </div>
              {isRecording ? <p className="recording-tip">Mueve el teléfono ahora. Mantén la página visible para no perder el permiso del sensor.</p> : null}
            </section>

            <div className="two-column-grid instructions-grid">
              <section className="card compact-card">
                <span className="eyebrow">Procedimiento sugerido</span>
                <ol className="procedure-list">
                  <li><span>01</span>Fija el teléfono sobre una superficie o carrito.</li>
                  <li><span>02</span>Activa sensores y espera la lectura inicial.</li>
                  <li><span>03</span>Realiza el movimiento durante 3 a 5 segundos.</li>
                  <li><span>04</span>Detén, observa el gráfico y exporta los datos.</li>
                </ol>
              </section>
              <section className="card compact-card physical-card">
                <span className="eyebrow">Para el prototipo físico</span>
                <h3>Smartphone + soporte + trayectoria</h3>
                <p>La página es la instrumentación digital. El soporte y el recorrido controlado serán la siguiente iteración de LabMotion.</p>
                <div className="physical-tags"><span>smartphone</span><span>carrito</span><span>mesa</span></div>
              </section>
            </div>
          </section>
        ) : null}

        {activeTab === "charts" ? (
          <section className="tab-content" role="tabpanel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Análisis preliminar</span>
                <h2>{measurement ? "Resultado de la medición" : "Explorar la señal"}</h2>
              </div>
              {measurement ? <span className="badge ok">{measurement.summary.samples} muestras</span> : <span className="badge">Modo en vivo</span>}
            </div>

            <section className="card chart-card">
              <div className="chart-toolbar">
                <div>
                  <h3>Variables registradas</h3>
                  <p>{measurement ? `Experimento: ${measurement.experiment.name}` : "Activa sensores o guarda una medición para llenar el gráfico."}</p>
                </div>
                <div className="chart-mode-switch" role="group" aria-label="Variable del gráfico">
                  <button className={chartMode === "acceleration" ? "active" : ""} type="button" onClick={() => setChartMode("acceleration")}>Aceleración</button>
                  <button className={chartMode === "gravity" ? "active" : ""} type="button" onClick={() => setChartMode("gravity")}>+ Gravedad</button>
                  <button className={chartMode === "rotation" ? "active" : ""} type="button" onClick={() => setChartMode("rotation")}>Giro</button>
                </div>
              </div>
              <div className="chart-frame chart-frame-large">
                <StripChart samples={chartSamples} mode={chartMode} />
              </div>
              {!measurement ? <p className="empty-hint">La vista se actualizará con la señal en vivo. Para analizar una experiencia, ve a <button className="inline-button" type="button" onClick={() => setActiveTab("measure")}>Medir</button>.</p> : null}
            </section>

            {measurement ? (
              <>
                <section className="summary-grid">
                  <div className="summary-item"><span>Duración</span><strong>{formatDuration(measurement.summary.durationMs)}</strong><small>tiempo capturado</small></div>
                  <div className="summary-item"><span>Frecuencia</span><strong>{measurement.summary.frequencyHz ? `${measurement.summary.frequencyHz.toFixed(1)} Hz` : "-"}</strong><small>muestras por segundo</small></div>
                  <div className="summary-item"><span>Pico de aceleración</span><strong>{measurement.summary.peakAcceleration ? `${measurement.summary.peakAcceleration.toFixed(2)}` : "-"}</strong><small>m/s2</small></div>
                  <div className="summary-item"><span>Pico de giro</span><strong>{measurement.summary.peakRotation ? `${measurement.summary.peakRotation.toFixed(1)}` : "-"}</strong><small>grados/s</small></div>
                </section>

                {kinematicPoints.length > 1 ? (
                  <div className="two-column-grid kinematics-grid">
                    <section className="card chart-card compact-chart-card">
                      <div className="card-heading"><div><h3>Velocidad estimada</h3><p>Integración trapezoidal del eje X</p></div></div>
                      <div className="chart-frame"><KinematicsChart points={kinematicPoints} metric="velocity" /></div>
                    </section>
                    <section className="card chart-card compact-chart-card">
                      <div className="card-heading"><div><h3>Posición estimada</h3><p>Segunda integración del eje X</p></div></div>
                      <div className="chart-frame"><KinematicsChart points={kinematicPoints} metric="position" /></div>
                    </section>
                  </div>
                ) : null}

                <section className="result-note">
                  <span className="note-mark">!</span>
                  <div><strong>Interpretación responsable</strong><p>La velocidad y posición son estimaciones exploratorias: el ruido, el sesgo y la orientación del teléfono generan deriva al integrar la aceleración.</p></div>
                </section>
                <div className="export-actions">
                  <button className="primary" type="button" onClick={() => downloadMeasurementCsv(measurement.samples, measurement.experiment.name)}>Descargar CSV</button>
                  <button className="ghost" type="button" onClick={() => downloadMeasurementJson(measurement.samples, measurement.experiment.name, diagnostics)}>Descargar JSON + diagnóstico</button>
                  <button className="ghost danger" type="button" onClick={() => { setMeasurement(null); showNotice("Medición eliminada de la sesión."); }}>Eliminar medición</button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {activeTab === "diagnostics" ? (
          <section className="tab-content" role="tabpanel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Prueba de compatibilidad</span>
                <h2>¿Puede este equipo participar?</h2>
              </div>
              <button className="ghost" type="button" onClick={() => void copyDiagnostics()}>Copiar diagnóstico</button>
            </div>

            <section className="card diagnostics-card">
              <div className="diagnostic-intro">
                <div className="diagnostic-score"><strong>{diagnostics.checks.filter((check) => check.supported).length}</strong><span>de {diagnostics.checks.length}<br />capacidades</span></div>
                <div><h3>Lectura del navegador</h3><p>Estas comprobaciones permiten demostrar la factibilidad antes de construir el soporte físico definitivo.</p></div>
              </div>
              <div className="diagnostic-list">
                {diagnostics.checks.map((check) => (
                  <div className="diagnostic-row" key={check.label}>
                    <CheckGlyph checked={check.supported} />
                    <div><strong>{check.label}</strong><span>{check.detail}</span></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card runtime-card">
              <div className="card-heading"><div><h3>Datos del entorno</h3><p>Información útil para documentar la prueba.</p></div><span className="mini-symbol">info</span></div>
              <dl className="runtime-list">
                <div><dt>Estado de sensores</dt><dd>{statusLabel(diagnostics.sensorState)}</dd></div>
                <div><dt>Frecuencia efectiva</dt><dd>{diagnostics.effectiveFrequencyHz ? `${diagnostics.effectiveFrequencyHz.toFixed(1)} Hz` : "Sin muestras"}</dd></div>
                <div><dt>Intervalo reportado</dt><dd>{diagnostics.reportedIntervalMs ? `${diagnostics.reportedIntervalMs.toFixed(1)} ms` : "Sin muestras"}</dd></div>
                <div><dt>Orientación de pantalla</dt><dd>{diagnostics.screenOrientation}</dd></div>
                <div><dt>Contexto</dt><dd>{diagnostics.userAgent.includes("Android") ? "Android / navegador móvil" : diagnostics.userAgent.includes("iPhone") ? "iPhone / navegador móvil" : "Escritorio u otro navegador"}</dd></div>
              </dl>
              <details className="user-agent-details"><summary>Ver user agent completo</summary><code>{diagnostics.userAgent}</code></details>
            </section>

            <section className="privacy-note"><span className="privacy-lock">local</span><div><strong>Privacidad por diseño</strong><p>Las mediciones viven en memoria del navegador. LabMotion no tiene login, servidor de datos ni envío de telemetría.</p></div></section>
          </section>
        ) : null}
      </main>

      <footer className="app-footer">
        <span>LabMotion · UMayor INGT1037 · Grupo 1</span>
        <span>Prototipo experimental v0.1</span>
      </footer>

      {showHelp ? (
        <Modal title="Cómo funciona LabMotion" onClose={() => setShowHelp(false)}>
          <div className="modal-body-copy">
            <p>El navegador escucha los eventos de movimiento que entrega el sistema operativo del smartphone. No se instala una aplicación.</p>
            <div className="modal-flow"><span>1. Sensor del teléfono</span><ArrowGlyph /><span>2. Evento web</span><ArrowGlyph /><span>3. Gráfico local</span></div>
            <p>El acelerómetro aporta aceleración en X, Y y Z. El giroscopio aporta velocidad angular. Cada muestra se guarda con su tiempo para comparar el fenómeno con su representación gráfica.</p>
            <div className="modal-callout"><strong>Para la presentación</strong><span>Activa sensores, vuelve a Medir, selecciona Aceleración y frenado, inicia una corrida y mueve el teléfono delante del curso.</span></div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

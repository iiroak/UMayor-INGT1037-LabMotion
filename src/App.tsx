import { useEffect, useRef, useState } from "react";
import { CalculationCatalog } from "./components/CalculationCatalog";
import { KinematicsChart, StripChart, type SensorChartMode } from "./components/StripChart";
import { Modal, TopAlert } from "./components/ui";
import { getDiagnostics, diagnosticsText, type Diagnostics } from "./lib/diagnostics";
import { copyText, downloadMeasurementCsv, downloadMeasurementJson } from "./lib/export";
import { frecuenciaDeMuestreo } from "./lib/fisica";
import { deriveXAxisKinematics, summarizeMeasurement, type MeasurementSummary } from "./lib/kinematics";
import {
  getSensorCapabilities,
  requestMotionPermission,
  subscribeToSensors,
  type MotionSample,
  type SensorCapabilities,
  type SensorState,
} from "./lib/sensors";

type Tab = "calculations" | "measure" | "charts" | "diagnostics";

type Measurement = {
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

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: "calculations", label: "Magnitudes", description: "Qué mide el teléfono" },
  { id: "measure", label: "Capturar", description: "Guardar muestras" },
  { id: "charts", label: "Gráficos", description: "Interpretar datos" },
  { id: "diagnostics", label: "Diagnóstico", description: "Verificar el teléfono" },
];

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
  const [activeTab, setActiveTab] = useState<Tab>("calculations");
  const [sensorState, setSensorState] = useState<SensorState>("idle");
  const [sensorError, setSensorError] = useState("");
  const [latest, setLatest] = useState<MotionSample | null>(null);
  const [liveSamples, setLiveSamples] = useState<MotionSample[]>([]);
  const [effectiveFrequencyHz, setEffectiveFrequencyHz] = useState<number | null>(null);
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
  const chartSamples = measurement?.samples ?? liveSamples;
  const kinematicPoints = deriveXAxisKinematics(chartSamples);
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
          setEffectiveFrequencyHz(frecuenciaDeMuestreo(sampleTimes));
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
            <span className="eyebrow">Demostrador de instrumentación · Grupo 1</span>
            <h1>Haz visible lo que el teléfono puede medir.</h1>
            <p>
              LabMotion muestra cómo un smartphone convierte aceleración, rotación y tiempo en
              magnitudes de movimiento que cualquiera puede revisar en el código.
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

        {activeTab === "calculations" ? (
          <CalculationCatalog
            latest={latest}
            samples={chartSamples}
            frequencyHz={effectiveFrequencyHz}
            kinematicPoints={kinematicPoints}
          />
        ) : null}

        {activeTab === "measure" ? (
          <section className="tab-content" role="tabpanel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Captura local</span>
                <h2>Guardar una serie de muestras</h2>
              </div>
              <span className="badge">Todo queda en este teléfono</span>
            </div>

            <section className="card capture-card">
              <div className="card-heading">
                <div>
                  <h3>Registrar lo que entrega el sensor</h3>
                  <p>No tienes que elegir una experiencia: primero observamos la señal y después decidimos qué analizar.</p>
                </div>
                <button className="text-button" type="button" onClick={() => setShowHelp(true)}>¿Cómo funciona?</button>
              </div>
              <div className="capture-description">
                <span className="capture-index">01</span>
                <div>
                  <strong>Aceleración, giro, orientación y tiempo</strong>
                  <p>Cada muestra conserva las lecturas directas para que puedas revisar de dónde sale cada cálculo.</p>
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
                <span className="eyebrow">Fuentes futuras</span>
                <h3>GPS + cámara + micrófono</h3>
                <p>El catálogo documenta otras fuentes posibles, pero esta versión demuestra las mediciones de movimiento que el navegador ya entrega.</p>
                <div className="physical-tags"><span>GPS: posible</span><span>cámara: posible</span><span>barómetro: no expuesto</span></div>
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
                  <p>{measurement ? "Captura local de sensores" : "Activa sensores o guarda una medición para llenar el gráfico."}</p>
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
                  <div className="summary-item"><span>Pico de aceleración</span><strong>{measurement.summary.peakAcceleration !== null ? measurement.summary.peakAcceleration.toFixed(2) : "-"}</strong><small>m/s2</small></div>
                  <div className="summary-item"><span>Pico de giro</span><strong>{measurement.summary.peakRotation !== null ? measurement.summary.peakRotation.toFixed(1) : "-"}</strong><small>grados/s</small></div>
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
                  <button className="primary" type="button" onClick={() => downloadMeasurementCsv(measurement.samples, "Captura de movimiento")}>Descargar CSV</button>
                  <button className="ghost" type="button" onClick={() => downloadMeasurementJson(measurement.samples, "Captura de movimiento", diagnostics)}>Descargar JSON + diagnóstico</button>
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
        <a className="github-link" href="https://github.com/iiroak/UMayor-INGT1037-LabMotion" target="_blank" rel="noreferrer">Código abierto en GitHub</a>
      </footer>

      {showHelp ? (
        <Modal title="Cómo funciona LabMotion" onClose={() => setShowHelp(false)}>
          <div className="modal-body-copy">
            <p>El navegador escucha los eventos de movimiento que entrega el sistema operativo del smartphone. No se instala una aplicación.</p>
            <div className="modal-flow"><span>1. Sensor del teléfono</span><ArrowGlyph /><span>2. Evento web</span><ArrowGlyph /><span>3. Gráfico local</span></div>
            <p>El acelerómetro aporta aceleración en X, Y y Z. El giroscopio aporta velocidad angular. Cada muestra se guarda con su tiempo para comparar el fenómeno con su representación gráfica.</p>
            <div className="modal-callout"><strong>Para la presentación</strong><span>Activa sensores, entra a Capturar, inicia una serie de muestras y mueve el teléfono delante del curso. Luego abre Magnitudes para explicar de dónde sale cada número.</span></div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

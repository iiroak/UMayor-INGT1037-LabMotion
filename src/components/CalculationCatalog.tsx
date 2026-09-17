import fisicaSource from "../lib/fisica.ts?raw";
import {
  anguloGirado,
  CALCULATION_CATALOG,
  errorRelativo,
  frecuenciaDeMuestreo,
  gravedadEstimada,
  inclinacionRespectoVertical,
  magnitudDeVector,
  type Vector3,
} from "../lib/fisica";
import type { KinematicPoint } from "../lib/kinematics";
import {
  type Axis,
  type MotionSample,
} from "../lib/sensors";

type CalculationCatalogProps = {
  latest: MotionSample | null;
  samples: MotionSample[];
  frequencyHz: number | null;
  kinematicPoints: KinematicPoint[];
};

function formatValue(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function completeVector(axis: Axis): Vector3 | null {
  if (axis.x === null || axis.y === null || axis.z === null) return null;
  return { x: axis.x, y: axis.y, z: axis.z };
}

function extractRegion(source: string, region: string): string {
  const startMarker = `// #region ${region}`;
  const start = source.indexOf(startMarker);
  if (start < 0) return "Codigo no disponible.";
  const contentStart = source.indexOf("\n", start) + 1;
  const end = source.indexOf("// #endregion", contentStart);
  return source.slice(contentStart, end < 0 ? source.length : end).trim();
}

function CodeDisclosure({ region }: { region?: string }) {
  if (!region) return null;
  return (
    <details className="calculation-code">
      <summary>Ver el codigo que lo calcula</summary>
      <pre><code>{extractRegion(fisicaSource, region)}</code></pre>
    </details>
  );
}

function ValueBadge({ value, unit }: { value: number | null; unit: string }) {
  return (
    <div className="calculation-value">
      <strong>{formatValue(value)}</strong>
      <span>{unit}</span>
    </div>
  );
}

function MeasurementCard({
  title,
  symbol,
  unit,
  description,
  values,
  source,
}: {
  title: string;
  symbol: string;
  unit: string;
  description: string;
  values: { label: string; value: number | null }[];
  source: string;
}) {
  const isVector = values.length > 1;
  return (
    <article className="card magnitude-card">
      <div className="magnitude-card-heading">
        <div>
          <span className="eyebrow">Medicion directa</span>
          <h3>{title}</h3>
        </div>
        <span className="magnitude-symbol">{symbol}</span>
      </div>
      {isVector ? (
        <div className="vector-value-grid">
          {values.map((item) => (
            <div className="vector-value" key={item.label}>
              <span>{item.label}</span>
              <strong>{formatValue(item.value)}</strong>
              <small>{unit}</small>
            </div>
          ))}
        </div>
      ) : <ValueBadge value={values[0]?.value ?? null} unit={unit} />}
      <p>{description}</p>
      <small className="magnitude-source">Origen: {source}</small>
    </article>
  );
}

function DerivedCard({
  title,
  symbol,
  unit,
  description,
  formula,
  source,
  value,
  region,
  reference,
}: {
  title: string;
  symbol: string;
  unit: string;
  description: string;
  formula: string;
  source: string;
  value: number | null;
  region?: string;
  reference?: { value: number | null; label: string };
}) {
  const error = reference?.value === null || reference?.value === undefined || value === null
    ? null
    : errorRelativo(value, reference.value);

  return (
    <article className="card magnitude-card derived-card">
      <div className="magnitude-card-heading">
        <div>
          <span className="eyebrow">Calculo derivado</span>
          <h3>{title}</h3>
        </div>
        <span className="magnitude-symbol">{symbol}</span>
      </div>
      <ValueBadge value={value} unit={unit} />
      <p>{description}</p>
      <div className="formula-box">
        <span>Formula</span>
        <code>{formula}</code>
      </div>
      {reference ? (
        <div className="reference-row">
          <span>{reference.label}</span>
          <strong>{reference.value === null ? "-" : `${reference.value.toFixed(2)} ${unit}`}</strong>
          {error !== null ? <small>Error {error.toFixed(2)}%</small> : null}
        </div>
      ) : null}
      <small className="magnitude-source">Origen: {source}</small>
      <CodeDisclosure region={region} />
    </article>
  );
}

function axisValues(axis: Axis | null): { label: string; value: number | null }[] {
  return [
    { label: "X", value: axis?.x ?? null },
    { label: "Y", value: axis?.y ?? null },
    { label: "Z", value: axis?.z ?? null },
  ];
}

export function CalculationCatalog({
  latest,
  samples,
  frequencyHz,
  kinematicPoints,
}: CalculationCatalogProps) {
  const accelerationVector = latest ? completeVector(latest.acceleration) : null;
  const totalAcceleration = latest ? completeVector(latest.accelerationIncludingGravity) : null;
  const gravity = accelerationVector && totalAcceleration
    ? gravedadEstimada(totalAcceleration, accelerationVector)
    : null;
  const gravityMagnitude = gravity ? magnitudDeVector(gravity) : null;
  const kinematics = kinematicPoints.length > 0 ? kinematicPoints[kinematicPoints.length - 1] : null;
  const sampleTimes = samples.map((sample) => sample.tMs);
  const angularSamples = samples.map((sample) => ({
    tMs: sample.tMs,
    velocidad: sample.rotationRate.x,
  }));
  const angle = samples.length > 1 ? anguloGirado(angularSamples) : null;
  const accelerationMagnitude = accelerationVector ? magnitudDeVector(accelerationVector) : null;
  const direct = CALCULATION_CATALOG.filter((item) => item.kind === "directa");
  const derived = CALCULATION_CATALOG.filter((item) => item.kind === "derivada");

  const directValues: Record<string, { label: string; value: number | null }[]> = {
    "linear-acceleration": axisValues(latest?.acceleration ?? null),
    "gravity-acceleration": axisValues(latest?.accelerationIncludingGravity ?? null),
    "angular-velocity": axisValues(latest?.rotationRate ?? null),
    orientation: axisValues(latest?.orientation ?? null),
    "sample-interval": [{ label: "t", value: latest?.intervalMs ?? null }],
  };
  const derivedValues: Record<string, number | null> = {
    magnitude: accelerationMagnitude,
    "estimated-gravity": gravityMagnitude,
    tilt: gravity ? inclinacionRespectoVertical(gravity) : null,
    frequency: frequencyHz ?? frecuenciaDeMuestreo(sampleTimes),
    velocity: kinematics?.velocity ?? null,
    position: kinematics?.position ?? null,
    "rotated-angle": angle,
  };

  return (
    <section className="tab-content" role="tabpanel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Instrumentacion abierta</span>
          <h2>Que puede medir un smartphone</h2>
        </div>
        <span className="badge">{samples.length > 0 ? `${samples.length} muestras` : "Sin muestras"}</span>
      </div>

      <section className="card catalog-intro-card">
        <div>
          <span className="eyebrow">De la medicion al calculo</span>
          <h3>El telefono es el instrumento</h3>
          <p>
            LabMotion recibe senales del sistema operativo, conserva el tiempo de cada muestra y muestra
            como una medicion directa se convierte en una magnitud calculada. El codigo que puedes abrir
            en cada tarjeta es el mismo que ejecuta esta pagina.
          </p>
        </div>
        <div className="catalog-flow">
          <span>Sensor</span><b>-&gt;</b><span>Muestra</span><b>-&gt;</b><span>Formula</span><b>-&gt;</b><span>Magnitud</span>
        </div>
      </section>

      <div className="catalog-section-heading">
        <div>
          <span className="eyebrow">Senales del dispositivo</span>
          <h3>Mediciones directas</h3>
        </div>
        <span>Lo que entrega el navegador</span>
      </div>
      <div className="magnitude-grid">
        {direct.map((item) => (
          <MeasurementCard
            key={item.id}
            title={item.title}
            symbol={item.symbol}
            unit={item.unit}
            description={item.description}
            values={directValues[item.id] ?? [{ label: "", value: null }]}
            source={item.source}
          />
        ))}
      </div>

      <div className="catalog-section-heading">
        <div>
          <span className="eyebrow">Fisica transparente</span>
          <h3>Magnitudes derivadas</h3>
        </div>
        <span>La formula queda visible</span>
      </div>
      <div className="magnitude-grid">
        {derived.map((item) => (
          <DerivedCard
            key={item.id}
            title={item.title}
            symbol={item.symbol}
            unit={item.unit}
            description={item.description}
            formula={item.formula}
            source={item.source}
            value={derivedValues[item.id] ?? null}
            region={item.region}
            reference={item.id === "estimated-gravity" ? { value: 9.80665, label: "Referencia terrestre" } : undefined}
          />
        ))}
      </div>

    </section>
  );
}

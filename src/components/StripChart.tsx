import { useEffect, useRef } from "react";
import type { KinematicPoint } from "../lib/kinematics";
import { primaryAcceleration, type MotionSample } from "../lib/sensors";

export type SensorChartMode = "acceleration" | "gravity" | "rotation";

type SensorSeries = {
  label: string;
  color: string;
  values: (sample: MotionSample) => number | null;
};

const sensorSeries: Record<SensorChartMode, SensorSeries[]> = {
  acceleration: [
    { label: "X", color: "#3a83f7", values: (sample) => primaryAcceleration(sample).x },
    { label: "Y", color: "#ee7c37", values: (sample) => primaryAcceleration(sample).y },
    { label: "Z", color: "#53b559", values: (sample) => primaryAcceleration(sample).z },
  ],
  gravity: [
    { label: "X", color: "#3a83f7", values: (sample) => sample.accelerationIncludingGravity.x },
    { label: "Y", color: "#ee7c37", values: (sample) => sample.accelerationIncludingGravity.y },
    { label: "Z", color: "#53b559", values: (sample) => sample.accelerationIncludingGravity.z },
  ],
  rotation: [
    { label: "alpha", color: "#3a83f7", values: (sample) => sample.rotationRate.x },
    { label: "beta", color: "#ee7c37", values: (sample) => sample.rotationRate.y },
    { label: "gamma", color: "#53b559", values: (sample) => sample.rotationRate.z },
  ],
};

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function drawFrame(
  canvas: HTMLCanvasElement,
  samples: MotionSample[],
  mode: SensorChartMode,
): void {
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 280;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const background = cssColor("--composer-surface-primary", "#ffffff");
  const border = cssColor("--border-default", "#0000001a");
  const secondary = cssColor("--text-tertiary", "#8f8f8f");
  const primary = cssColor("--text-primary", "#0d0d0d");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const padding = { top: 18, right: 16, bottom: 32, left: 46 };
  const plotWidth = Math.max(width - padding.left - padding.right, 1);
  const plotHeight = Math.max(height - padding.top - padding.bottom, 1);
  const visibleSamples = samples.slice(-720);
  const series = sensorSeries[mode];
  const values = series.flatMap((item) => visibleSamples
    .map(item.values)
    .filter((value): value is number => value !== null));
  const dataLimit = values.length > 0
    ? Math.max(1, Math.ceil(Math.max(...values.map((value) => Math.abs(value))) * 1.15 * 10) / 10)
    : 1;
  const minTime = visibleSamples[0]?.tMs ?? 0;
  const maxTime = visibleSamples[visibleSamples.length - 1]?.tMs ?? minTime + 1000;
  const timeSpan = Math.max(maxTime - minTime, 1000);

  context.font = "11px system-ui, sans-serif";
  context.lineWidth = 1;
  context.strokeStyle = border;
  context.fillStyle = secondary;
  context.textAlign = "right";
  for (let index = 0; index <= 4; index += 1) {
    const y = padding.top + (plotHeight * index) / 4;
    const value = dataLimit - (dataLimit * 2 * index) / 4;
    context.beginPath();
    context.moveTo(padding.left, y + 0.5);
    context.lineTo(width - padding.right, y + 0.5);
    context.stroke();
    context.fillText(value.toFixed(mode === "rotation" ? 0 : 1), padding.left - 8, y + 4);
  }
  context.textAlign = "center";
  context.fillText("tiempo", padding.left + plotWidth / 2, height - 7);
  context.save();
  context.translate(12, padding.top + plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(mode === "rotation" ? "grados/s" : "m/s2", 0, 0);
  context.restore();

  if (visibleSamples.length < 2) {
    context.fillStyle = secondary;
    context.textAlign = "center";
    context.font = "600 12px system-ui, sans-serif";
    context.fillText("Activa los sensores para ver datos reales", padding.left + plotWidth / 2, padding.top + plotHeight / 2);
    return;
  }

  for (const item of series) {
    context.beginPath();
    context.strokeStyle = item.color;
    context.lineWidth = 2;
    let started = false;
    visibleSamples.forEach((sample) => {
      const value = item.values(sample);
      if (value === null) {
        started = false;
        return;
      }
      const x = padding.left + ((sample.tMs - minTime) / timeSpan) * plotWidth;
      const y = padding.top + ((dataLimit - value) / (dataLimit * 2)) * plotHeight;
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();
  }

  context.fillStyle = primary;
  context.font = "600 10px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText(mode === "acceleration" ? "aceleración lineal" : mode === "gravity" ? "aceleración + gravedad" : "velocidad angular", padding.left, 11);
}

export function StripChart({ samples, mode }: { samples: MotionSample[]; mode: SensorChartMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => drawFrame(canvas, samples, mode);
    draw();
    const parent = canvas.parentElement;
    const observer = typeof ResizeObserver === "undefined" || !parent
      ? null
      : new ResizeObserver(draw);
    if (observer && parent) observer.observe(parent);
    return () => observer?.disconnect();
  }, [mode, samples]);

  return <canvas className="strip-chart" ref={canvasRef} aria-label="Gráfico de datos de sensores" />;
}

export function KinematicsChart({
  points,
  metric,
}: {
  points: KinematicPoint[];
  metric: "velocity" | "position";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth || 640;
    const height = canvas.clientHeight || 220;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const border = cssColor("--border-default", "#0000001a");
    const secondary = cssColor("--text-tertiary", "#8f8f8f");
    context.clearRect(0, 0, width, height);
    const padding = { top: 20, right: 12, bottom: 28, left: 44 };
    const plotWidth = Math.max(width - padding.left - padding.right, 1);
    const plotHeight = Math.max(height - padding.top - padding.bottom, 1);
    const values = points.map((point) => point[metric]);
    const limit = Math.max(0.01, Math.ceil(Math.max(...values.map((value) => Math.abs(value)), 0.01) * 1.15 * 100) / 100);
    const minTime = points[0]?.tMs ?? 0;
    const timeSpan = Math.max((points[points.length - 1]?.tMs ?? minTime) - minTime, 1000);

    context.strokeStyle = border;
    context.lineWidth = 1;
    context.fillStyle = secondary;
    context.font = "10px system-ui, sans-serif";
    context.textAlign = "right";
    for (let index = 0; index <= 2; index += 1) {
      const y = padding.top + (plotHeight * index) / 2;
      const value = limit - limit * index;
      context.beginPath();
      context.moveTo(padding.left, y + 0.5);
      context.lineTo(width - padding.right, y + 0.5);
      context.stroke();
      context.fillText(value.toFixed(2), padding.left - 7, y + 3);
    }
    context.textAlign = "center";
    context.fillText(metric === "velocity" ? "v en eje X (m/s)" : "x en eje X (m)", padding.left + plotWidth / 2, height - 7);

    if (points.length < 2) return;
    context.beginPath();
    context.strokeStyle = "#a67df2";
    context.lineWidth = 2;
    points.forEach((point, index) => {
      const x = padding.left + ((point.tMs - minTime) / timeSpan) * plotWidth;
      const y = padding.top + ((limit - point[metric]) / (limit * 2)) * plotHeight;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }, [metric, points]);

  return <canvas className="strip-chart kinematics-chart" ref={canvasRef} aria-label={`Gráfico de ${metric === "velocity" ? "velocidad" : "posición"}`} />;
}

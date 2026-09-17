import type { Diagnostics } from "./diagnostics";
import type { MotionSample } from "./sensors";

function formatCsvNumber(value: number | null): string {
  return value === null ? "" : value.toFixed(5);
}

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadMeasurementCsv(samples: MotionSample[], experiment: string): void {
  const firstTime = samples[0]?.tMs ?? 0;
  const rows = samples.map((sample) => [
    (sample.tMs - firstTime).toFixed(2),
    formatCsvNumber(sample.acceleration.x),
    formatCsvNumber(sample.acceleration.y),
    formatCsvNumber(sample.acceleration.z),
    formatCsvNumber(sample.accelerationIncludingGravity.x),
    formatCsvNumber(sample.accelerationIncludingGravity.y),
    formatCsvNumber(sample.accelerationIncludingGravity.z),
    formatCsvNumber(sample.rotationRate.x),
    formatCsvNumber(sample.rotationRate.y),
    formatCsvNumber(sample.rotationRate.z),
    formatCsvNumber(sample.orientation.x),
    formatCsvNumber(sample.orientation.y),
    formatCsvNumber(sample.orientation.z),
    formatCsvNumber(sample.intervalMs),
  ].join(","));

  const csv = [
    `# LabMotion | Experimento: ${experiment}`,
    "t_ms,ax_m_s2,ay_m_s2,az_m_s2,ax_gravity_m_s2,ay_gravity_m_s2,az_gravity_m_s2,alpha_deg_s,beta_deg_s,gamma_deg_s,orientation_alpha_deg,orientation_beta_deg,orientation_gamma_deg,interval_ms",
    ...rows,
  ].join("\n");
  downloadBlob(csv, "labmotion-medicion.csv", "text/csv;charset=utf-8");
}

export function downloadMeasurementJson(
  samples: MotionSample[],
  experiment: string,
  diagnostics: Diagnostics,
): void {
  const firstTime = samples[0]?.tMs ?? 0;
  const normalizedSamples = samples.map((sample) => ({
    ...sample,
    tMs: Number((sample.tMs - firstTime).toFixed(2)),
  }));
  const json = JSON.stringify(
    {
      project: "LabMotion",
      experiment,
      capturedAt: new Date().toISOString(),
      diagnostics,
      samples: normalizedSamples,
    },
    null,
    2,
  );
  downloadBlob(json, "labmotion-medicion.json", "application/json;charset=utf-8");
}

export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea method for browsers without clipboard permission.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

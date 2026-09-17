import type { SensorCapabilities, SensorState } from "./sensors";

export type DiagnosticCheck = {
  label: string;
  detail: string;
  supported: boolean;
};

export type Diagnostics = {
  checks: DiagnosticCheck[];
  userAgent: string;
  screenOrientation: string;
  effectiveFrequencyHz: number | null;
  reportedIntervalMs: number | null;
  sensorState: SensorState;
};

function supportLabel(supported: boolean): string {
  return supported ? "Disponible" : "No detectado";
}

export function getDiagnostics(
  capabilities: SensorCapabilities,
  sensorState: SensorState,
  effectiveFrequencyHz: number | null,
  reportedIntervalMs: number | null,
): Diagnostics {
  return {
    checks: [
      {
        label: "Contexto seguro (HTTPS)",
        detail: capabilities.secureContext ? "La página puede solicitar sensores." : "Los sensores web requieren HTTPS.",
        supported: capabilities.secureContext,
      },
      {
        label: "DeviceMotionEvent",
        detail: supportLabel(capabilities.deviceMotion),
        supported: capabilities.deviceMotion,
      },
      {
        label: "DeviceOrientationEvent",
        detail: supportLabel(capabilities.deviceOrientation),
        supported: capabilities.deviceOrientation,
      },
      {
        label: "Generic Sensor: Accelerometer",
        detail: supportLabel(capabilities.accelerometer),
        supported: capabilities.accelerometer,
      },
      {
        label: "Generic Sensor: Gyroscope",
        detail: supportLabel(capabilities.gyroscope),
        supported: capabilities.gyroscope,
      },
      {
        label: "Generic Sensor: LinearAccelerationSensor",
        detail: supportLabel(capabilities.linearAcceleration),
        supported: capabilities.linearAcceleration,
      },
    ],
    userAgent: navigator.userAgent,
    screenOrientation: screen.orientation?.type ?? "No disponible",
    effectiveFrequencyHz,
    reportedIntervalMs,
    sensorState,
  };
}

export function diagnosticsText(diagnostics: Diagnostics): string {
  const checks = diagnostics.checks
    .map((check) => `${check.supported ? "OK" : "NO"} | ${check.label} | ${check.detail}`)
    .join("\n");

  return [
    "LabMotion - Diagnóstico de sensores",
    `Estado: ${diagnostics.sensorState}`,
    `Contexto: ${window.isSecureContext ? "seguro" : "no seguro"}`,
    `Frecuencia efectiva: ${diagnostics.effectiveFrequencyHz === null ? "-" : `${diagnostics.effectiveFrequencyHz.toFixed(1)} Hz`}`,
    `Intervalo reportado: ${diagnostics.reportedIntervalMs === null ? "-" : `${diagnostics.reportedIntervalMs.toFixed(1)} ms`}`,
    `Orientación: ${diagnostics.screenOrientation}`,
    `Navegador: ${diagnostics.userAgent}`,
    "",
    checks,
  ].join("\n");
}

import { integrarTrapecio, frecuenciaDeMuestreo, magnitudDeVector } from "./fisica";
import { primaryAcceleration, type MotionSample } from "./sensors";

export type KinematicPoint = {
  tMs: number;
  velocity: number;
  position: number;
};

export type MeasurementSummary = {
  durationMs: number;
  samples: number;
  frequencyHz: number | null;
  peakAcceleration: number | null;
  peakRotation: number | null;
};

export function deriveXAxisKinematics(samples: MotionSample[]): KinematicPoint[] {
  const points: KinematicPoint[] = [];
  let previousTime: number | null = null;
  let previousAcceleration: number | null = null;
  let velocity = 0;
  let position = 0;

  for (const sample of samples) {
    // No integrar accelerationIncludingGravity: la gravedad produciría una velocidad falsa.
    const acceleration = sample.acceleration.x;
    if (acceleration === null) {
      // Un hueco invalida la continuidad del trapecio: no inventar muestras intermedias.
      previousTime = null;
      previousAcceleration = null;
      continue;
    }

    if (previousTime !== null && previousAcceleration !== null) {
      const deltaSeconds = Math.min((sample.tMs - previousTime) / 1000, 0.25);
      if (deltaSeconds > 0) {
        const nextVelocity = velocity + integrarTrapecio(previousAcceleration, acceleration, deltaSeconds);
        position += integrarTrapecio(velocity, nextVelocity, deltaSeconds);
        velocity = nextVelocity;
      }
    }

    points.push({ tMs: sample.tMs, velocity, position });
    previousTime = sample.tMs;
    previousAcceleration = acceleration;
  }

  return points;
}

export function summarizeMeasurement(samples: MotionSample[]): MeasurementSummary {
  const durationMs = samples.length > 1 ? samples[samples.length - 1].tMs - samples[0].tMs : 0;
  let peakAcceleration: number | null = null;
  let peakRotation: number | null = null;

  for (const sample of samples) {
    const acceleration = primaryAcceleration(sample);
    const accelerationMagnitude = acceleration.x !== null && acceleration.y !== null && acceleration.z !== null
      ? magnitudDeVector({ x: acceleration.x, y: acceleration.y, z: acceleration.z })
      : null;
    const rotation = sample.rotationRate;
    const rotationMagnitude = rotation.x !== null && rotation.y !== null && rotation.z !== null
      ? magnitudDeVector({ x: rotation.x, y: rotation.y, z: rotation.z })
      : null;

    if (accelerationMagnitude !== null && (peakAcceleration === null || accelerationMagnitude > peakAcceleration)) {
      peakAcceleration = accelerationMagnitude;
    }
    if (rotationMagnitude !== null && (peakRotation === null || rotationMagnitude > peakRotation)) {
      peakRotation = rotationMagnitude;
    }
  }

  return {
    durationMs,
    samples: samples.length,
    frequencyHz: frecuenciaDeMuestreo(samples.map((sample) => sample.tMs)),
    peakAcceleration,
    peakRotation,
  };
}

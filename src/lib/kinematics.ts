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

function averageFrequency(samples: MotionSample[]): number | null {
  if (samples.length < 2) return null;
  const elapsedMs = samples[samples.length - 1].tMs - samples[0].tMs;
  return elapsedMs > 0 ? ((samples.length - 1) / elapsedMs) * 1000 : null;
}

export function deriveXAxisKinematics(samples: MotionSample[]): KinematicPoint[] {
  const points: KinematicPoint[] = [];
  let previousTime: number | null = null;
  let previousAcceleration: number | null = null;
  let velocity = 0;
  let position = 0;

  for (const sample of samples) {
    const acceleration = primaryAcceleration(sample).x;
    if (acceleration === null) continue;

    if (previousTime !== null && previousAcceleration !== null) {
      const deltaSeconds = Math.min((sample.tMs - previousTime) / 1000, 0.25);
      if (deltaSeconds > 0) {
        const nextVelocity = velocity + ((previousAcceleration + acceleration) / 2) * deltaSeconds;
        position += ((velocity + nextVelocity) / 2) * deltaSeconds;
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
    const accelerationMagnitude = Math.sqrt(
      (acceleration.x ?? 0) ** 2 +
      (acceleration.y ?? 0) ** 2 +
      (acceleration.z ?? 0) ** 2,
    );
    const rotation = sample.rotationRate;
    const rotationMagnitude = Math.sqrt(
      (rotation.x ?? 0) ** 2 +
      (rotation.y ?? 0) ** 2 +
      (rotation.z ?? 0) ** 2,
    );

    if (peakAcceleration === null || accelerationMagnitude > peakAcceleration) {
      peakAcceleration = accelerationMagnitude;
    }
    if (peakRotation === null || rotationMagnitude > peakRotation) {
      peakRotation = rotationMagnitude;
    }
  }

  return {
    durationMs,
    samples: samples.length,
    frequencyHz: averageFrequency(samples),
    peakAcceleration,
    peakRotation,
  };
}

import { describe, expect, it } from "vitest";
import { deriveXAxisKinematics, summarizeMeasurement } from "./kinematics";
import type { MotionSample } from "./sensors";

function sample(tMs: number, accelerationX: number | null, rotationX: number | null = 1): MotionSample {
  return {
    tMs,
    acceleration: { x: accelerationX, y: 0, z: 0 },
    accelerationIncludingGravity: { x: accelerationX, y: 0, z: 9.8 },
    rotationRate: { x: rotationX, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0 },
    intervalMs: 250,
  };
}

describe("derivacion de cinematica", () => {
  it("integra aceleracion constante en velocidad y posicion", () => {
    const points = deriveXAxisKinematics([
      sample(0, 2),
      sample(250, 2),
      sample(500, 2),
      sample(750, 2),
      sample(1000, 2),
    ]);
    const last = points[points.length - 1];

    expect(last.velocity).toBeCloseTo(2);
    expect(last.position).toBeCloseTo(1);
  });

  it("corta la integracion cuando falta una muestra", () => {
    const points = deriveXAxisKinematics([
      sample(0, 2),
      sample(250, 2),
      sample(500, null),
      sample(750, 2),
    ]);

    expect(points).toHaveLength(3);
    expect(points[2].velocity).toBeCloseTo(points[1].velocity);
    expect(points[2].position).toBeCloseTo(points[1].position);
  });

  it("no inventa un pico cuando faltan ejes", () => {
    const summary = summarizeMeasurement([
      sample(0, null, null),
      sample(250, null, null),
    ]);

    expect(summary.peakAcceleration).toBeNull();
    expect(summary.peakRotation).toBeNull();
  });
});

import { magnitudDeVector } from "./fisica";

export type Axis = {
  x: number | null;
  y: number | null;
  z: number | null;
};

export type MotionSample = {
  tMs: number;
  acceleration: Axis;
  accelerationIncludingGravity: Axis;
  rotationRate: Axis;
  orientation: Axis;
  intervalMs: number | null;
};

export type SensorState = "idle" | "requesting" | "active" | "denied" | "unsupported" | "error";

export type MotionPermission = "granted" | "denied" | "unsupported" | "insecure";

export type SensorCapabilities = {
  secureContext: boolean;
  deviceMotion: boolean;
  deviceOrientation: boolean;
  accelerometer: boolean;
  gyroscope: boolean;
  linearAcceleration: boolean;
};

type AxisSource = {
  x?: number | null;
  y?: number | null;
  z?: number | null;
} | null | undefined;

type OrientationSource = {
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
} | null | undefined;

type MotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readAxis(source: AxisSource): Axis {
  return {
    x: finiteOrNull(source?.x),
    y: finiteOrNull(source?.y),
    z: finiteOrNull(source?.z),
  };
}

function readOrientation(source: OrientationSource): Axis {
  return {
    x: finiteOrNull(source?.alpha),
    y: finiteOrNull(source?.beta),
    z: finiteOrNull(source?.gamma),
  };
}

export function axisHasData(axis: Axis): boolean {
  return axis.x !== null || axis.y !== null || axis.z !== null;
}

export function axisMagnitude(axis: Axis): number | null {
  if (axis.x === null || axis.y === null || axis.z === null) return null;
  return magnitudDeVector({ x: axis.x, y: axis.y, z: axis.z });
}

function browserFeature(name: string): boolean {
  return name in (window as unknown as Record<string, unknown>);
}

export function getSensorCapabilities(): SensorCapabilities {
  return {
    secureContext: window.isSecureContext,
    deviceMotion: "DeviceMotionEvent" in window,
    deviceOrientation: "DeviceOrientationEvent" in window,
    accelerometer: browserFeature("Accelerometer"),
    gyroscope: browserFeature("Gyroscope"),
    linearAcceleration: browserFeature("LinearAccelerationSensor"),
  };
}

export async function requestMotionPermission(): Promise<MotionPermission> {
  if (!window.isSecureContext) return "insecure";
  if (!("DeviceMotionEvent" in window)) return "unsupported";

  const MotionEvent = window.DeviceMotionEvent as MotionEventWithPermission;
  if (typeof MotionEvent.requestPermission !== "function") return "granted";

  try {
    return (await MotionEvent.requestPermission()) === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export function subscribeToSensors(onSample: (sample: MotionSample) => void): () => void {
  let latestOrientation: Axis = { x: null, y: null, z: null };

  const handleOrientation = (event: DeviceOrientationEvent) => {
    latestOrientation = readOrientation(event);
  };

  const handleMotion = (event: DeviceMotionEvent) => {
    onSample({
      tMs: performance.now(),
      acceleration: readAxis(event.acceleration),
      accelerationIncludingGravity: readAxis(event.accelerationIncludingGravity),
      rotationRate: readOrientation(event.rotationRate),
      orientation: latestOrientation,
      intervalMs: finiteOrNull(event.interval),
    });
  };

  window.addEventListener("deviceorientation", handleOrientation, { passive: true });
  window.addEventListener("devicemotion", handleMotion, { passive: true });

  return () => {
    window.removeEventListener("deviceorientation", handleOrientation);
    window.removeEventListener("devicemotion", handleMotion);
  };
}

export function primaryAcceleration(sample: MotionSample): Axis {
  return axisHasData(sample.acceleration)
    ? sample.acceleration
    : sample.accelerationIncludingGravity;
}

export function primaryAccelerationIncludesGravity(sample: MotionSample): boolean {
  return !axisHasData(sample.acceleration);
}

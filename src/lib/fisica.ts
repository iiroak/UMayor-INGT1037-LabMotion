export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type CalculationDefinition = {
  id: string;
  title: string;
  symbol: string;
  unit: string;
  kind: "directa" | "derivada";
  description: string;
  formula: string;
  source: string;
  region?: string;
};

export type CapabilityDefinition = {
  title: string;
  detail: string;
  status: "disponible" | "posible" | "limitada";
};

// #region magnitudDeVector
/**
 * Magnitud de un vector de tres componentes.
 * |v| = raiz(x^2 + y^2 + z^2)
 */
export function magnitudDeVector(vector: Vector3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}
// #endregion

// #region gravedadEstimada
/**
 * Separa la gravedad de la aceleracion total que entrega el sensor.
 * g = aceleracionConGravedad - aceleracionLineal
 */
export function gravedadEstimada(
  aceleracionConGravedad: Vector3,
  aceleracionLineal: Vector3,
): Vector3 {
  return {
    x: aceleracionConGravedad.x - aceleracionLineal.x,
    y: aceleracionConGravedad.y - aceleracionLineal.y,
    z: aceleracionConGravedad.z - aceleracionLineal.z,
  };
}
// #endregion

// #region inclinacionRespectoVertical
/**
 * Angulo entre el vector de gravedad y el eje vertical del telefono.
 * theta = arccos(g_z / |g|)
 */
export function inclinacionRespectoVertical(gravedad: Vector3): number {
  const magnitud = magnitudDeVector(gravedad);
  if (magnitud === 0) return 0;
  const coseno = Math.max(-1, Math.min(1, gravedad.z / magnitud));
  return (Math.acos(coseno) * 180) / Math.PI;
}
// #endregion

// #region integrarTrapecio
/**
 * Area bajo la curva entre dos muestras usando la regla del trapecio.
 * integral = ((valorAnterior + valorActual) / 2) * delta_t
 */
export function integrarTrapecio(
  valorAnterior: number,
  valorActual: number,
  deltaSeconds: number,
): number {
  return ((valorAnterior + valorActual) / 2) * deltaSeconds;
}
// #endregion

// #region frecuenciaDeMuestreo
/**
 * Frecuencia media de una serie de muestras.
 * frecuencia = (muestras - 1) / tiempo_transcurrido
 */
export function frecuenciaDeMuestreo(
  tiemposMs: readonly number[],
): number | null {
  if (tiemposMs.length < 2) return null;
  const tiempoTranscurridoMs = tiemposMs[tiemposMs.length - 1] - tiemposMs[0];
  return tiempoTranscurridoMs > 0
    ? ((tiemposMs.length - 1) / tiempoTranscurridoMs) * 1000
    : null;
}
// #endregion

// #region anguloGirado
/**
 * Integra una velocidad angular para estimar el angulo girado.
 * Los tramos con datos faltantes no se conectan artificialmente.
 */
export function anguloGirado(
  muestras: readonly { tMs: number; velocidad: number | null }[],
): number {
  let angulo = 0;
  let anterior: { tMs: number; velocidad: number } | null = null;

  for (const muestra of muestras) {
    if (muestra.velocidad === null) {
      anterior = null;
      continue;
    }

    if (anterior !== null) {
      const deltaSeconds = Math.min((muestra.tMs - anterior.tMs) / 1000, 0.25);
      if (deltaSeconds > 0) {
        angulo += integrarTrapecio(anterior.velocidad, muestra.velocidad, deltaSeconds);
      }
    }

    anterior = { tMs: muestra.tMs, velocidad: muestra.velocidad };
  }

  return angulo;
}
// #endregion

// #region errorRelativo
/**
 * Diferencia porcentual entre un valor medido y una referencia.
 */
export function errorRelativo(medido: number, referencia: number): number | null {
  if (!Number.isFinite(medido) || referencia === 0) return null;
  return (Math.abs(medido - referencia) / Math.abs(referencia)) * 100;
}
// #endregion

export const CALCULATION_CATALOG: CalculationDefinition[] = [
  {
    id: "linear-acceleration",
    title: "Aceleracion lineal",
    symbol: "a_x, a_y, a_z",
    unit: "m/s2",
    kind: "directa",
    description: "Cambio de velocidad que el acelerometro detecta en cada eje.",
    formula: "a = (a_x, a_y, a_z)",
    source: "DeviceMotionEvent.acceleration",
  },
  {
    id: "gravity-acceleration",
    title: "Aceleracion con gravedad",
    symbol: "a + g",
    unit: "m/s2",
    kind: "directa",
    description: "Lectura que conserva la aceleracion del movimiento y la gravedad.",
    formula: "a_total = (a + g)_x, (a + g)_y, (a + g)_z",
    source: "DeviceMotionEvent.accelerationIncludingGravity",
  },
  {
    id: "angular-velocity",
    title: "Velocidad angular",
    symbol: "alpha, beta, gamma",
    unit: "grados/s",
    kind: "directa",
    description: "Rapidez con la que el telefono gira alrededor de sus tres ejes.",
    formula: "omega = (alpha, beta, gamma)",
    source: "DeviceMotionEvent.rotationRate",
  },
  {
    id: "orientation",
    title: "Orientacion",
    symbol: "alpha, beta, gamma",
    unit: "grados",
    kind: "directa",
    description: "Angulos de orientacion reportados por el sistema operativo.",
    formula: "orientacion = (alpha, beta, gamma)",
    source: "DeviceOrientationEvent",
  },
  {
    id: "sample-interval",
    title: "Intervalo de muestreo",
    symbol: "delta_t",
    unit: "ms",
    kind: "directa",
    description: "Tiempo que el navegador informa entre dos muestras consecutivas.",
    formula: "delta_t = t_n - t_(n-1)",
    source: "DeviceMotionEvent.interval",
  },
  {
    id: "magnitude",
    title: "Magnitud de aceleracion",
    symbol: "|a|",
    unit: "m/s2",
    kind: "derivada",
    description: "Una sola cifra resume la aceleracion de los tres ejes.",
    formula: "|a| = raiz(a_x^2 + a_y^2 + a_z^2)",
    source: "Calculo a partir de acceleration",
    region: "magnitudDeVector",
  },
  {
    id: "estimated-gravity",
    title: "Gravedad estimada",
    symbol: "g",
    unit: "m/s2",
    kind: "derivada",
    description: "Resta la aceleracion lineal de la lectura que incluye gravedad.",
    formula: "g = (a + g) - a",
    source: "Dos lecturas de DeviceMotionEvent",
    region: "gravedadEstimada",
  },
  {
    id: "tilt",
    title: "Inclinacion respecto a la vertical",
    symbol: "theta",
    unit: "grados",
    kind: "derivada",
    description: "Angulo calculado desde la direccion estimada de la gravedad.",
    formula: "theta = arccos(g_z / |g|)",
    source: "Calculo a partir de gravedad estimada",
    region: "inclinacionRespectoVertical",
  },
  {
    id: "frequency",
    title: "Frecuencia de muestreo",
    symbol: "f",
    unit: "Hz",
    kind: "derivada",
    description: "Cantidad media de muestras recibidas por segundo.",
    formula: "f = (N - 1) / delta_t",
    source: "Tiempos de las muestras",
    region: "frecuenciaDeMuestreo",
  },
  {
    id: "velocity",
    title: "Velocidad estimada",
    symbol: "v_x",
    unit: "m/s",
    kind: "derivada",
    description: "Integra la aceleracion lineal del eje X desde una velocidad inicial cero.",
    formula: "v_n = v_(n-1) + integral(a, delta_t)",
    source: "Integracion trapezoidal de aceleracion",
    region: "integrarTrapecio",
  },
  {
    id: "position",
    title: "Posicion estimada",
    symbol: "x_x",
    unit: "m",
    kind: "derivada",
    description: "Integra la velocidad estimada para obtener un desplazamiento relativo.",
    formula: "x_n = x_(n-1) + integral(v, delta_t)",
    source: "Segunda integracion en eje X",
    region: "integrarTrapecio",
  },
  {
    id: "rotated-angle",
    title: "Angulo girado",
    symbol: "theta_giro",
    unit: "grados",
    kind: "derivada",
    description: "Integra la velocidad angular para estimar cuanto giro el telefono.",
    formula: "theta = integral(omega, delta_t)",
    source: "Integracion trapezoidal de rotationRate",
    region: "anguloGirado",
  },
];

export const CAPABILITY_LEVELS: CapabilityDefinition[] = [
  {
    title: "Medible ahora",
    detail: "Aceleracion, gravedad, giro, orientacion, tiempo y frecuencia mediante APIs que ya usa LabMotion.",
    status: "disponible",
  },
  {
    title: "Posible con otra implementacion",
    detail: "GPS, camara, microfono y Generic Sensor API tienen APIs web, pero no forman parte de esta captura.",
    status: "posible",
  },
  {
    title: "Limitado en la web",
    detail: "No se promete barometro ni magnetometro: el navegador no ofrece una ruta estable y portable para esas lecturas.",
    status: "limitada",
  },
];

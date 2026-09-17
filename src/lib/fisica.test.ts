import { describe, expect, it } from "vitest";
import {
  anguloGirado,
  errorRelativo,
  frecuenciaDeMuestreo,
  gravedadEstimada,
  inclinacionRespectoVertical,
  integrarTrapecio,
  magnitudDeVector,
} from "./fisica";

describe("calculos de fisica", () => {
  it("calcula la magnitud de un vector", () => {
    expect(magnitudDeVector({ x: 3, y: 4, z: 0 })).toBe(5);
  });

  it("separa la gravedad de la aceleracion total", () => {
    expect(gravedadEstimada(
      { x: 2, y: -1, z: 9.8 },
      { x: 2, y: -1, z: 0 },
    )).toEqual({ x: 0, y: 0, z: 9.8 });
  });

  it("calcula la inclinacion vertical", () => {
    expect(inclinacionRespectoVertical({ x: 0, y: 0, z: 9.8 })).toBeCloseTo(0);
    expect(inclinacionRespectoVertical({ x: 9.8, y: 0, z: 0 })).toBeCloseTo(90);
  });

  it("integra una aceleracion constante con trapecios", () => {
    const aceleracion = 2;
    const deltaSeconds = 1;
    expect(integrarTrapecio(aceleracion, aceleracion, deltaSeconds)).toBe(2);
  });

  it("calcula frecuencia media y angulo girado", () => {
    expect(frecuenciaDeMuestreo([0, 100, 200])).toBe(10);
    expect(anguloGirado([
      { tMs: 0, velocidad: 10 },
      { tMs: 250, velocidad: 10 },
      { tMs: 500, velocidad: 10 },
      { tMs: 750, velocidad: 10 },
      { tMs: 1000, velocidad: 10 },
    ])).toBe(10);
  });

  it("calcula error relativo contra una referencia", () => {
    expect(errorRelativo(9.8, 9.80665)).toBeCloseTo(0.0678, 3);
  });
});

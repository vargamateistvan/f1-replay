export type UnitSystem = "metric" | "imperial";

const KMH_TO_MPH = 0.621371;
const CELSIUS_TO_FAHRENHEIT_SCALE = 9 / 5;
const CELSIUS_TO_FAHRENHEIT_OFFSET = 32;
const MPS_TO_MPH = 2.236936;
const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;

export function toDisplaySpeed(kmh: number, unitSystem: UnitSystem): number {
  if (unitSystem === "imperial") return kmh * KMH_TO_MPH;
  return kmh;
}

export function speedUnitLabel(unitSystem: UnitSystem): string {
  return unitSystem === "imperial" ? "mph" : "km/h";
}

export function speedUnitCompactLabel(unitSystem: UnitSystem): string {
  return unitSystem === "imperial" ? "MPH" : "KMH";
}

export function toDisplayTemperature(
  celsius: number,
  unitSystem: UnitSystem,
): number {
  if (unitSystem === "imperial") {
    return celsius * CELSIUS_TO_FAHRENHEIT_SCALE + CELSIUS_TO_FAHRENHEIT_OFFSET;
  }
  return celsius;
}

export function temperatureUnitLabel(unitSystem: UnitSystem): string {
  return unitSystem === "imperial" ? "F" : "C";
}

export function toDisplayWindSpeed(
  metersPerSecond: number,
  unitSystem: UnitSystem,
): number {
  if (unitSystem === "imperial") return metersPerSecond * MPS_TO_MPH;
  return metersPerSecond;
}

export function windSpeedUnitLabel(unitSystem: UnitSystem): string {
  return unitSystem === "imperial" ? "mph" : "m/s";
}

export function toDisplayDistanceKm(km: number, unitSystem: UnitSystem): number {
  if (unitSystem === "imperial") return km * KM_TO_MI;
  return km;
}

export function distanceUnitLabel(unitSystem: UnitSystem): string {
  return unitSystem === "imperial" ? "mi" : "km";
}

export function toDisplayAltitudeM(meters: number, unitSystem: UnitSystem): number {
  if (unitSystem === "imperial") return meters * M_TO_FT;
  return meters;
}

export function altitudeUnitLabel(unitSystem: UnitSystem): string {
  return unitSystem === "imperial" ? "ft" : "m";
}

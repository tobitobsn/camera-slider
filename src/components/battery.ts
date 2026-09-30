/**
 * PROJ-6 Akkuanzeige — pure battery logic: pack voltage → percent → level.
 * No I/O; the voltage comes from SliderStatus.batteryMillivolts.
 */

/** Below this the firmware counts as "no battery detected" (USB-only, divider missing) — spec.md AC-11. */
export const BATTERY_PRESENT_MILLIVOLTS = 5000;

/** spec.md AC-4 / AC-5 */
export const LOW_PERCENT = 20;
export const CRITICAL_PERCENT = 10;

export type BatteryLevel = 'unknown' | 'ok' | 'low' | 'critical';

/**
 * Li-ion resting-voltage curve per cell (design.md "Kennlinie"), ascending.
 * 0 % sits exactly on the firmware's protective threshold (3.10 V × 3 =
 * 9.30 V), so the display reaches 0 when the slider stops.
 */
const CELL_CURVE: ReadonlyArray<readonly [cellMillivolts: number, percent: number]> = [
  [3100, 0],
  [3400, 5],
  [3500, 10],
  [3600, 20],
  [3700, 35],
  [3800, 50],
  [3900, 65],
  [4000, 80],
  [4100, 90],
  [4200, 100],
];

const CELLS_IN_SERIES = 3;

/**
 * @returns 0–100 (rounded), or null when there is no reading or no battery
 *   is detected (< 5000 mV).
 */
export function batteryPercent(packMillivolts: number | null): number | null {
  if (packMillivolts === null || packMillivolts < BATTERY_PRESENT_MILLIVOLTS) {
    return null;
  }
  const cell = packMillivolts / CELLS_IN_SERIES;
  const [firstMv, firstPct] = CELL_CURVE[0];
  if (cell <= firstMv) {
    return firstPct;
  }
  for (let i = 1; i < CELL_CURVE.length; i++) {
    const [upperMv, upperPct] = CELL_CURVE[i];
    if (cell <= upperMv) {
      const [lowerMv, lowerPct] = CELL_CURVE[i - 1];
      const fraction = (cell - lowerMv) / (upperMv - lowerMv);
      return Math.round(lowerPct + fraction * (upperPct - lowerPct));
    }
  }
  return 100;
}

export function batteryLevel(percent: number | null): BatteryLevel {
  if (percent === null) {
    return 'unknown';
  }
  if (percent < CRITICAL_PERCENT) {
    return 'critical';
  }
  if (percent < LOW_PERCENT) {
    return 'low';
  }
  return 'ok';
}

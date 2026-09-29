import {
  autoCorrectedDurationText,
  formatSeconds,
  maxAutoDriveDurationSeconds,
  minAutoDriveDurationSeconds,
  parseDurationSeconds,
  solveAutoDriveSpeedStepsPerSec,
  statusLabelFor,
  ceilToDeciseconds,
  floorToDeciseconds,
  shouldAutoCorrectOnDistanceChange,
} from './AutoDriveControls';
import type { SliderStatus } from '../ble/client';

const BASE_STATUS: SliderStatus = {
  hasStart: false,
  hasEnd: false,
  atStart: false,
  atEnd: false,
  driving: false,
  endIsAfterStart: null,
  distanceSteps: null,
  timelapseMoving: false,
};

describe('parseDurationSeconds', () => {
  it('parses a plain integer string', () => {
    expect(parseDurationSeconds('10')).toBe(10);
  });

  it('parses a dot-decimal value', () => {
    expect(parseDurationSeconds('2.5')).toBe(2.5);
  });

  it('accepts a comma as the decimal separator (German keyboards)', () => {
    expect(parseDurationSeconds('2,5')).toBe(2.5);
  });

  it('trims surrounding whitespace', () => {
    expect(parseDurationSeconds('  7  ')).toBe(7);
  });

  it('returns null for an empty string', () => {
    expect(parseDurationSeconds('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(parseDurationSeconds('   ')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseDurationSeconds('abc')).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parseDurationSeconds('0')).toBeNull();
  });

  it('returns null for a negative value', () => {
    expect(parseDurationSeconds('-5')).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(parseDurationSeconds('Infinity')).toBeNull();
  });
});

describe('formatSeconds', () => {
  it('formats to one decimal place', () => {
    expect(formatSeconds(2.5)).toBe('2.5');
  });

  it('rounds to one decimal place', () => {
    expect(formatSeconds(2.449)).toBe('2.4');
  });

  it('formats a whole number with a trailing .0', () => {
    expect(formatSeconds(10)).toBe('10.0');
  });
});

describe('solveAutoDriveSpeedStepsPerSec', () => {
  it('solves a higher speed than naive distance/duration to compensate for the ramp', () => {
    // qa-report.md BUG-2 repro: naively distance/duration = 2000 steps/s,
    // which would actually arrive at 4000/2000 + 2000/8000 = 2.25s, late.
    const speed = solveAutoDriveSpeedStepsPerSec(4000, 2);
    expect(speed).not.toBeNull();
    expect(speed as number).toBeCloseTo(2343.1457505076196, 6);
  });

  it('returns exactly the min-speed boundary at maxAutoDriveDurationSeconds', () => {
    const speed = solveAutoDriveSpeedStepsPerSec(4000, maxAutoDriveDurationSeconds(4000));
    expect(speed).not.toBeNull();
    expect(speed as number).toBeCloseTo(200, 6);
  });

  it('returns exactly the max-speed boundary at minAutoDriveDurationSeconds (cap-limited distance)', () => {
    const speed = solveAutoDriveSpeedStepsPerSec(16000, minAutoDriveDurationSeconds(16000));
    expect(speed).not.toBeNull();
    expect(speed as number).toBeCloseTo(8000, 6);
  });

  it('returns null when the duration is below the physical minimum for the distance', () => {
    // qa-report.md BUG-2: 1000 steps can never complete in 0.1s at 8000
    // steps/s^2 acceleration, no matter how fast the cruise speed — the
    // physical floor is 2*sqrt(1000/8000) ≈ 0.707s.
    expect(solveAutoDriveSpeedStepsPerSec(1000, 0.1)).toBeNull();
  });

  it('would previously have silently accepted a too-short duration (regression guard)', () => {
    // The old distance/duration formula gave exactly 4000 steps/s here —
    // inside the valid range — even though the real trapezoidal move takes
    // 10.5s, not 10s. The fixed formula must reject it instead.
    expect(solveAutoDriveSpeedStepsPerSec(40000, 10)).toBeGreaterThan(4000);
  });

  // qa-report.md BUG-3 (residual after the first fix): the naive
  // (aT - sqrt(disc))/2 form subtracts two nearly-equal large numbers for
  // long, slow drives, which is where the firmware's float32 lost enough
  // precision to land on the wrong side of the 200-4000 boundary (e.g.
  // 199.984 instead of 200) and silently reject a duration the app itself
  // had shown as valid. src/components/AutoDriveControls.tsx now uses the
  // same product-of-roots reformulation as firmware/src/motor.cpp to avoid
  // that subtraction. NOT covered by a test here: JS's double precision
  // doesn't reproduce the cancellation for realistic distances (verified —
  // (aT - sqrt(disc))/2 and the reformulation give identical `double`
  // results for the firmware's actual float32-only repro cases), so a test
  // asserting an exact boundary value would pass unchanged with either
  // formula — a tautological test the "prove it can fail" rule rules out.
  // The fix is real (it matches the firmware's fix, which does need it) and
  // was verified by hand against the two reported repro cases; it just
  // isn't something this test file can independently prove.
});

describe('minAutoDriveDurationSeconds / maxAutoDriveDurationSeconds', () => {
  it('uses the trapezoidal-at-max-speed formula once the cap is reachable', () => {
    // 16000 steps: peak speed sqrt(8000*16000) = 11313.7 > 8000, so the cap is
    // reachable and binding: 16000/8000 + 8000/8000 = 3s.
    expect(minAutoDriveDurationSeconds(16000)).toBeCloseTo(3, 6);
  });

  it('falls back to the physical (triangular) floor below the cap-relevant distance', () => {
    // 1000 steps: peak speed sqrt(8000*1000) ≈ 2828 < 8000, so the move
    // never reaches the cap — the floor is the pure acceleration/deceleration
    // profile, not distance/maxSpeed + maxSpeed/acceleration.
    expect(minAutoDriveDurationSeconds(1000)).toBeCloseTo(2 * Math.sqrt(1000 / 8000), 6);
  });

  it('computes the slowest duration at the 200 steps/s floor', () => {
    expect(maxAutoDriveDurationSeconds(4000)).toBeCloseTo(20.025, 6);
  });
});

describe('autoCorrectedDurationText', () => {
  it('replaces an empty field with the minimum duration', () => {
    expect(autoCorrectedDurationText('', 4000)).toBe('1.5');
  });

  it('replaces unparseable text with the minimum duration', () => {
    expect(autoCorrectedDurationText('abc', 4000)).toBe('1.5');
  });

  it('replaces a too-short duration (speed above the cap) with the minimum duration', () => {
    // 4000 steps at 1s would need far more than 4000 steps/s.
    expect(autoCorrectedDurationText('1', 4000)).toBe('1.5');
  });

  it('leaves a too-long duration (speed below the floor) untouched', () => {
    // 4000 steps at 100s is far slower than the 200 steps/s floor.
    expect(autoCorrectedDurationText('100', 4000)).toBeNull();
  });

  it('leaves an already-valid duration untouched', () => {
    expect(autoCorrectedDurationText('10', 4000)).toBeNull();
  });

  it('always fills in a duration that is actually drivable (BUG-18: nearest-tenth rounding went below the minimum)', () => {
    // 4000 steps: minimum is 1.414s — "1.4" would be invalid, "1.5" is the
    // smallest valid tenth. 3000 and 9920 were the other reported cases.
    for (const distance of [3000, 4000, 9920, 12080, 777, 5000, 100000]) {
      const text = autoCorrectedDurationText('', distance) as string;
      const seconds = Number(text);
      expect(solveAutoDriveSpeedStepsPerSec(distance, seconds)).not.toBeNull();
      // and it is then left alone by a second blur
      expect(autoCorrectedDurationText(text, distance)).toBeNull();
    }
  });

  it('ceilToDeciseconds rounds up but keeps an exact tenth', () => {
    expect(ceilToDeciseconds(1.414)).toBe(1.5);
    expect(ceilToDeciseconds(3)).toBe(3);
    expect(ceilToDeciseconds(2.2000000001)).toBe(2.3);
  });

  it('BUG-16: the range shown in the error message consists of drivable bounds', () => {
    for (const distance of [1000, 1009, 4000, 39993, 100000]) {
      const min = ceilToDeciseconds(minAutoDriveDurationSeconds(distance));
      const max = floorToDeciseconds(maxAutoDriveDurationSeconds(distance));
      expect(solveAutoDriveSpeedStepsPerSec(distance, min)).not.toBeNull();
      expect(solveAutoDriveSpeedStepsPerSec(distance, max)).not.toBeNull();
    }
    expect(floorToDeciseconds(5.09)).toBe(5);
    expect(floorToDeciseconds(3)).toBe(3);
  });

  it('BUG-24/27/28: corrects on every newly known distance, but not while a preset is being applied', () => {
    expect(shouldAutoCorrectOnDistanceChange(null, 160000, null)).toBe(true);
    // later user change to a larger distance (BUG-28)
    expect(shouldAutoCorrectOnDistanceChange(50000, 160000, null)).toBe(true);
    // intermediate distance while a preset is being applied (BUG-24/27)
    expect(shouldAutoCorrectOnDistanceChange(null, 50000, 20000)).toBe(false);
    expect(shouldAutoCorrectOnDistanceChange(100000, 50000, 20000)).toBe(false);
    // unchanged / unknown distance
    expect(shouldAutoCorrectOnDistanceChange(50000, 50000, null)).toBe(false);
    expect(shouldAutoCorrectOnDistanceChange(160000, null, null)).toBe(false);
  });

  it('leaves the exact minimum-boundary duration untouched (not re-formatted)', () => {
    const exactMin = formatSeconds(minAutoDriveDurationSeconds(16000));
    expect(autoCorrectedDurationText(exactMin, 16000)).toBeNull();
  });

  it('returns null when no distance is known yet (nothing to correct to)', () => {
    expect(autoCorrectedDurationText('1', null)).toBeNull();
  });

  it('returns null for a zero distance (start and end identical)', () => {
    expect(autoCorrectedDurationText('1', 0)).toBeNull();
  });
});

describe('statusLabelFor', () => {
  it('shows "Fährt…" while driving, regardless of other flags', () => {
    expect(statusLabelFor({ ...BASE_STATUS, driving: true })).toBe('Fährt…');
  });

  it('shows the missing-points message when start is not set', () => {
    expect(statusLabelFor({ ...BASE_STATUS, hasEnd: true })).toBe(
      'Kein Start-/Endpunkt gesetzt',
    );
  });

  it('shows the missing-points message when end is not set', () => {
    expect(statusLabelFor({ ...BASE_STATUS, hasStart: true })).toBe(
      'Kein Start-/Endpunkt gesetzt',
    );
  });

  it('shows "Bereit" once both points are set and not driving', () => {
    expect(statusLabelFor({ ...BASE_STATUS, hasStart: true, hasEnd: true })).toBe('Bereit');
  });
});

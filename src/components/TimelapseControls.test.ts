// This file (per the project's convention, see AutoDriveControls.test.ts)
// tests only TimelapseControls.tsx's exported pure helper functions, never
// the component itself. Importing from that module still evaluates its
// top-level imports though, including react-native-vision-camera and
// @react-native-camera-roll/camera-roll — both native-module-backed
// libraries that ship untranspiled ESM (see jest.config.js's comment on
// react-native-ble-plx for the general reason) and aren't in
// transformIgnorePatterns' exception list. Mocked here the same way
// useCameraCapture.test.ts already does, purely so the import resolves;
// nothing in this file actually calls into either mock.
jest.mock('react-native-vision-camera', () => ({
  useCameraPermission: jest.fn(() => ({
    hasPermission: false,
    requestPermission: jest.fn(),
  })),
  useCameraDevice: jest.fn(() => undefined),
  usePhotoOutput: jest.fn(() => ({})),
  Camera: 'Camera',
}));

jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: { save: jest.fn() },
}));

import {
  timelapseCameraState,
  computeTotalDurationSeconds,
  formatDurationSeconds,
  parseIntervalSecondsText,
  parseShotCountText,
} from './TimelapseControls';

describe('parseShotCountText', () => {
  it('parses a plain integer string', () => {
    expect(parseShotCountText('10')).toBe(10);
  });

  it('accepts the lower boundary (2)', () => {
    expect(parseShotCountText('2')).toBe(2);
  });

  it('accepts the upper boundary (999)', () => {
    expect(parseShotCountText('999')).toBe(999);
  });

  it('rejects one below the lower boundary (1)', () => {
    expect(parseShotCountText('1')).toBeNull();
  });

  it('rejects one above the upper boundary (1000)', () => {
    expect(parseShotCountText('1000')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(parseShotCountText('  10  ')).toBe(10);
  });

  it('returns null for an empty string', () => {
    expect(parseShotCountText('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(parseShotCountText('   ')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseShotCountText('abc')).toBeNull();
  });

  it('returns null for a decimal value (whole shots only)', () => {
    expect(parseShotCountText('2.5')).toBeNull();
  });

  it('returns null for a negative value', () => {
    expect(parseShotCountText('-5')).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parseShotCountText('0')).toBeNull();
  });
});

describe('parseIntervalSecondsText', () => {
  it('parses a plain integer string', () => {
    expect(parseIntervalSecondsText('5')).toBe(5);
  });

  it('accepts the lower boundary (1)', () => {
    expect(parseIntervalSecondsText('1')).toBe(1);
  });

  it('accepts the upper boundary (3600)', () => {
    expect(parseIntervalSecondsText('3600')).toBe(3600);
  });

  it('rejects one below the lower boundary (0)', () => {
    expect(parseIntervalSecondsText('0')).toBeNull();
  });

  it('rejects one above the upper boundary (3601)', () => {
    expect(parseIntervalSecondsText('3601')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(parseIntervalSecondsText('  5  ')).toBe(5);
  });

  it('returns null for an empty string', () => {
    expect(parseIntervalSecondsText('')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseIntervalSecondsText('abc')).toBeNull();
  });

  it('returns null for a decimal value (whole seconds only)', () => {
    expect(parseIntervalSecondsText('1.5')).toBeNull();
  });

  it('returns null for a negative value', () => {
    expect(parseIntervalSecondsText('-1')).toBeNull();
  });
});

describe('computeTotalDurationSeconds', () => {
  it('computes (shotCount - 1) * intervalSeconds', () => {
    expect(computeTotalDurationSeconds(10, 5)).toBe(45);
  });

  it('returns 0 for the minimum shot count (no intervals elapse before the only shot)', () => {
    expect(computeTotalDurationSeconds(2, 5)).toBe(5);
  });

  it('scales with a large shot count and interval', () => {
    expect(computeTotalDurationSeconds(999, 3600)).toBe(998 * 3600);
  });
});

describe('formatDurationSeconds', () => {
  it('formats plain seconds under a minute', () => {
    expect(formatDurationSeconds(45)).toBe('45 s');
  });

  it('formats zero seconds', () => {
    expect(formatDurationSeconds(0)).toBe('0 s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDurationSeconds(250)).toBe('4 Min 10 s');
  });

  it('formats an exact minute with 0 trailing seconds', () => {
    expect(formatDurationSeconds(60)).toBe('1 Min 0 s');
  });

  it('rounds a fractional value before formatting', () => {
    expect(formatDurationSeconds(44.6)).toBe('45 s');
  });

  it('clamps a negative value to 0 s', () => {
    expect(formatDurationSeconds(-5)).toBe('0 s');
  });

  it('formats a long multi-hour duration', () => {
    expect(formatDurationSeconds(998 * 3600)).toBe(`${998 * 60} Min 0 s`);
  });
});

describe('timelapseCameraState (PROJ-3 EC-10)', () => {
  it('shows the video hint and blocks the camera while "Video aufnehmen" is on, whatever the permission', () => {
    expect(timelapseCameraState(true, true)).toEqual({ view: 'videoHint', cameraUsable: false });
    expect(timelapseCameraState(false, true)).toEqual({ view: 'videoHint', cameraUsable: false });
  });

  it('behaves as before when "Video aufnehmen" is off', () => {
    expect(timelapseCameraState(true, false)).toEqual({ view: 'preview', cameraUsable: true });
    expect(timelapseCameraState(false, false)).toEqual({ view: 'permissionHint', cameraUsable: false });
  });
});

import { formatSeconds, parseDurationSeconds, statusLabelFor } from './AutoDriveControls';
import type { SliderStatus } from '../ble/client';

const BASE_STATUS: SliderStatus = {
  hasStart: false,
  hasEnd: false,
  atStart: false,
  atEnd: false,
  driving: false,
  distanceSteps: null,
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

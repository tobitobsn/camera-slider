import { batteryLevel, batteryPercent } from './battery';

describe('batteryPercent', () => {
  it('returns null without a reading or below 5000 mV (no battery detected)', () => {
    expect(batteryPercent(null)).toBeNull();
    expect(batteryPercent(40)).toBeNull(); // USB only
    expect(batteryPercent(4999)).toBeNull();
    expect(batteryPercent(5000)).toBe(0); // "present", but far below the curve
  });

  it('hits the curve points exactly (pack = cell × 3)', () => {
    expect(batteryPercent(12600)).toBe(100);
    expect(batteryPercent(12300)).toBe(90);
    expect(batteryPercent(12000)).toBe(80);
    expect(batteryPercent(11700)).toBe(65);
    expect(batteryPercent(11400)).toBe(50);
    expect(batteryPercent(11100)).toBe(35);
    expect(batteryPercent(10800)).toBe(20);
    expect(batteryPercent(10500)).toBe(10);
    expect(batteryPercent(10200)).toBe(5);
    expect(batteryPercent(9300)).toBe(0);
  });

  it('interpolates linearly between points and clamps outside the curve', () => {
    expect(batteryPercent(11550)).toBe(58); // halfway 50..65 → 57.5 → 58
    expect(batteryPercent(13000)).toBe(100);
    expect(batteryPercent(9000)).toBe(0);
  });
});

describe('batteryLevel', () => {
  it('maps percent to the warning levels (AC-4: < 20 orange, AC-5: < 10 red)', () => {
    expect(batteryLevel(null)).toBe('unknown');
    expect(batteryLevel(100)).toBe('ok');
    expect(batteryLevel(20)).toBe('ok');
    expect(batteryLevel(19)).toBe('low');
    expect(batteryLevel(10)).toBe('low');
    expect(batteryLevel(9)).toBe('critical');
    expect(batteryLevel(0)).toBe('critical');
  });
});

describe('confirmIfBatteryCritical (AC-6)', () => {
  const { Alert } = require('react-native');
  const { confirmIfBatteryCritical } = require('./battery');
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('runs the action directly at >= 10 % and without a battery', () => {
    for (const mv of [11400, 10500, null, 40]) {
      const action = jest.fn();
      confirmIfBatteryCritical(mv, action);
      expect(action).toHaveBeenCalledTimes(1);
    }
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('asks below 10 % and only runs the action on "Trotzdem starten"', () => {
    const action = jest.fn();
    confirmIfBatteryCritical(10200, action); // 5 %
    expect(action).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [, message, buttons] = alertSpy.mock.calls[0];
    expect(message).toBe('Akku fast leer – Fahrt trotzdem starten?');
    const cancel = buttons.find((b: { text: string }) => b.text === 'Abbrechen');
    const go = buttons.find((b: { text: string }) => b.text === 'Trotzdem starten');
    cancel.onPress?.();
    expect(action).not.toHaveBeenCalled();
    go.onPress();
    expect(action).toHaveBeenCalledTimes(1);
  });
});

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { BatteryLockBanner } from './BatteryLockBanner';
import type { LockReason } from '../ble/client';

function texts(reason: LockReason, shutdownSeconds: number | null): string[] {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(React.createElement(BatteryLockBanner, { reason, shutdownSeconds }));
  });
  return r.root.findAllByType(Text).map(t => ([] as unknown[]).concat(t.props.children).join(''));
}

describe('BatteryLockBanner', () => {
  it('names an empty battery (AC-9)', () => {
    expect(texts('lowBattery', null)[0]).toBe('Akku leer – bitte laden');
  });

  it('names a measurement fault differently (AC-13)', () => {
    expect(texts('measurementFault', null)[0]).toBe('Akkumessung gestört – bitte Verkabelung prüfen');
  });

  it('shows the countdown while the slider is about to switch off (AC-12, EC-8)', () => {
    expect(texts('lowBattery', 42)).toContain('Slider schaltet sich in 42 s ab');
    expect(texts('lowBattery', null).some(t => t.includes('schaltet sich'))).toBe(false);
  });

  it('asks to switch the slider off (remaining standby draw)', () => {
    expect(texts('lowBattery', null).some(t => t.includes('schalte den Slider aus'))).toBe(true);
  });
});

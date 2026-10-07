/**
 * Render-level tests for PROJ-2 EC-6 / EC-7 (refined 2026-10-07,
 * qa-report.md BUG-78): when the "hold at standstill" switch is operable.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Switch } from 'react-native';

jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('../connection/ConnectionProvider', () => ({
  useConnection: () => ({ device: { id: 'dev' } }),
}));
jest.mock('../ble/client', () => ({
  sendJogCommand: jest.fn(() => Promise.resolve()),
  sendStopCommand: jest.fn(() => Promise.resolve()),
  sendSetHoldCommand: jest.fn(() => Promise.resolve()),
}));

import { JogControls } from './JogControls';

function holdSwitch(props: { disabled?: boolean; holdLocked?: boolean; holdAtStandstill?: boolean | null }) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(React.createElement(JogControls, { holdAtStandstill: true, ...props }));
  });
  return r.root.findAllByType(Switch)[0];
}

describe('JogControls hold switch', () => {
  it('is operable while connected and nothing else runs (AC-10)', () => {
    expect(holdSwitch({}).props.disabled).toBe(false);
  });

  it('is locked with the other controls during an auto-drive, video take or timelapse (EC-6, BUG-78)', () => {
    expect(holdSwitch({ disabled: true }).props.disabled).toBe(true);
  });

  it('is locked by the battery lock on its own (EC-7)', () => {
    expect(holdSwitch({ holdLocked: true }).props.disabled).toBe(true);
  });

  it('is hidden when the firmware does not report the setting', () => {
    expect(holdSwitch({ holdAtStandstill: null })).toBeUndefined();
  });
});

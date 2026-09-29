/**
 * Render-level tests for AC-12 (duration auto-correction when the known
 * distance changes) and its interplay with PROJ-4's "load preset, then
 * Als Start setzen" flow (qa-report.md BUG-19/24/27/28). The pure helpers are
 * covered in AutoDriveControls.test.ts; these prove the wiring in the
 * component, which is where BUG-24/BUG-27 actually lived.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { TextInput, Text } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('../connection/ConnectionProvider', () => ({
  useConnection: () => ({ device: { id: 'dev' } }),
}));
const mockSent: unknown[][] = [];
jest.mock('../ble/client', () => ({
  sendAutoDriveCommand: jest.fn((...a: unknown[]) => {
    mockSent.push(['auto', ...a.slice(1)]);
    return Promise.resolve();
  }),
  sendSetEndCommand: jest.fn(() => Promise.resolve()),
  sendSetEndFromDistanceCommand: jest.fn((...a: unknown[]) => {
    mockSent.push(['endFromDist', ...a.slice(1)]);
    return Promise.resolve();
  }),
  sendSetStartCommand: jest.fn(() => {
    mockSent.push(['setStart']);
    return Promise.resolve();
  }),
  sendStopCommand: jest.fn(() => Promise.resolve()),
}));
 
let mockSetStatus: (s: any) => void = () => {};
jest.mock('./useSliderStatus', () => {
  const R = require('react');
  return {
    useSliderStatus: () => {
      const [s, set] = R.useState({
        hasStart: false,
        hasEnd: false,
        atStart: false,
        atEnd: false,
        driving: false,
        endIsAfterStart: null,
        distanceSteps: null,
        timelapseMoving: false,
      });
      mockSetStatus = set;
      return s;
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AutoDriveControls } from './AutoDriveControls';

const flush = () => new Promise<void>(r => setImmediate(() => r()));

function both(distance: number) {
  return {
    hasStart: true,
    hasEnd: true,
    atStart: true,
    atEnd: false,
    driving: false,
    endIsAfterStart: true,
    distanceSteps: distance,
    timelapseMoving: false,
  };
}
function onlyEnd() {
  return {
    hasStart: false,
    hasEnd: true,
    atStart: false,
    atEnd: false,
    driving: false,
    endIsAfterStart: null,
    distanceSteps: null,
    timelapseMoving: false,
  };
}
const label = (t: { props: any }) => ([] as unknown[]).concat(t.props.children).join('');
const value = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findByType(TextInput).props.value;
function pressable(r: ReactTestRenderer.ReactTestRenderer, text: string) {
  const all = r.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      typeof n.type !== 'string' &&
      n.findAllByType(Text).some(t => label(t).includes(text)),
  );
  return all[all.length - 1];
}
async function mount() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(React.createElement(AutoDriveControls));
    await flush();
  });
  return r;
}
const notify = (s: unknown) =>
  act(async () => {
    mockSetStatus(s);
    await flush();
  });
const press = (r: ReactTestRenderer.ReactTestRenderer, text: string) =>
  act(async () => {
    await pressable(r, text).props.onPress();
    await flush();
  });
const seed = (presets: unknown[]) =>
  AsyncStorage.setItem('camera-slider.presets', JSON.stringify(presets));

const SCHNELL = { id: '1', name: 'Schnell', distanceSteps: 20000, endIsAfterStart: true, durationSeconds: 3.5, createdAt: 1, dirVersion: 2 };
const KURZ = { id: '2', name: 'Kurz', distanceSteps: 2000, endIsAfterStart: true, durationSeconds: 1.0, createdAt: 2, dirVersion: 2 };

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSent.length = 0;
});

describe('AC-12 auto-correction (render)', () => {
  it('BUG-19: default "10" is corrected once a long distance becomes known', async () => {
    const r = await mount();
    await notify(both(160000));
    expect(value(r)).toBe('21.0');
    expect(pressable(r, 'Start → Ende').props.disabled).toBe(false);
  });

  it('BUG-28: a later, larger distance corrects a now-too-short untouched duration', async () => {
    const r = await mount();
    await notify(both(50000));
    expect(value(r)).toBe('10');
    await notify(both(160000));
    expect(value(r)).toBe('21.0');
    expect(pressable(r, 'Start → Ende').props.disabled).toBe(false);
  });

  it('a deliberately long duration is never overwritten', async () => {
    const r = await mount();
    await act(async () => {
      r.root.findByType(TextInput).props.onChangeText('900');
      await flush();
    });
    await notify(both(100000));
    await notify(both(120000));
    expect(value(r)).toBe('900');
  });
});

describe('preset flow keeps its duration (BUG-24/27)', () => {
  it('both points set before: intermediate distance does not overwrite the preset duration', async () => {
    await seed([SCHNELL]);
    const r = await mount();
    await notify(both(100000));
    await press(r, 'Schnell');
    expect(value(r)).toBe('3.5');
    await press(r, 'Als Start setzen');
    await notify(both(50000)); // intermediate: new start vs old end
    expect(value(r)).toBe('3.5');
    await notify(both(20000)); // SET_END_FROM_DISTANCE landed
    expect(value(r)).toBe('3.5');
    mockSent.length = 0;
    await press(r, 'Start → Ende');
    expect(mockSent).toEqual([['auto', 'startToEnd', 3.5]]);
  });

  it('only an end point set before: the intermediate distance is not "first known" (BUG-27)', async () => {
    await seed([SCHNELL]);
    const r = await mount();
    await notify(onlyEnd());
    await press(r, 'Schnell');
    await press(r, 'Als Start setzen');
    await notify(both(50000));
    expect(value(r)).toBe('3.5');
    await notify(both(20000));
    expect(value(r)).toBe('3.5');
  });

  it('BUG-27 worst case: a short preset is not turned into a locked, too-long duration', async () => {
    await seed([KURZ]);
    const r = await mount();
    await notify(onlyEnd());
    await press(r, 'Kurz');
    await press(r, 'Als Start setzen');
    await notify(both(150000));
    await notify(both(2000));
    expect(value(r)).toBe('1.0');
    expect(pressable(r, 'Start → Ende').props.disabled).toBe(false);
  });

  it('after the preset is applied, a later user change corrects again (guard released)', async () => {
    await seed([SCHNELL]);
    const r = await mount();
    await notify(both(100000));
    await press(r, 'Schnell');
    await press(r, 'Als Start setzen');
    await notify(both(20000));
    expect(value(r)).toBe('3.5');
    await notify(both(160000)); // user sets a new, far end point
    expect(value(r)).toBe('21.0');
  });
});

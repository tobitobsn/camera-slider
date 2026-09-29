/**
 * Render-level tests for AC-12 (refined 2026-09-30): a too-short duration is
 * never overwritten on its own; the app shows the minimum and offers
 * "Minimum übernehmen". Also covers PROJ-4's "load preset, then Als Start
 * setzen" flow, whose intermediate distance used to overwrite the preset's
 * duration (qa-report.md BUG-24/27/33).
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

const hint = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .map(label)
    .find(t => t.includes('Minimum') && !t.includes('übernehmen')) ?? null;

describe('AC-12: too-short duration is shown, not overwritten', () => {
  it('BUG-19: default "10" with a long distance shows the minimum and a way to take it', async () => {
    const r = await mount();
    await notify(both(160000));
    expect(value(r)).toBe('10'); // never overwritten on its own
    expect(pressable(r, 'Start → Ende').props.disabled).toBe(true);
    expect(hint(r)).toContain('Zu kurz für diese Strecke');
    expect(hint(r)).toContain('21.0 s');
    await press(r, 'Minimum übernehmen');
    expect(value(r)).toBe('21.0');
    expect(pressable(r, 'Start → Ende').props.disabled).toBe(false);
    expect(hint(r)).toBeNull();
  });

  it('a later, larger distance makes the duration too short: shown, not silently locked (BUG-28)', async () => {
    const r = await mount();
    await notify(both(50000));
    expect(hint(r)).toBeNull();
    await notify(both(160000));
    expect(value(r)).toBe('10');
    expect(hint(r)).toContain('21.0 s');
  });

  it('an empty field shows the minimum as well', async () => {
    const r = await mount();
    await act(async () => {
      r.root.findByType(TextInput).props.onChangeText('');
      await flush();
    });
    await notify(both(100000));
    expect(hint(r)).toContain('Keine gültige Dauer');
    expect(hint(r)).toContain('13.5 s');
  });

  it('a deliberately long duration is never overwritten and gets no too-short hint', async () => {
    const r = await mount();
    await act(async () => {
      r.root.findByType(TextInput).props.onChangeText('900');
      await flush();
    });
    await notify(both(100000));
    await notify(both(120000));
    expect(value(r)).toBe('900');
    expect(hint(r)).toBeNull();
  });

  it('AC-11 still corrects on blur', async () => {
    const r = await mount();
    await notify(both(100000));
    await act(async () => {
      const input = r.root.findByType(TextInput);
      input.props.onChangeText('1');
      input.props.onBlur();
      await flush();
    });
    expect(value(r)).toBe('13.5');
  });

  it('no hint without both points', async () => {
    const r = await mount();
    await notify(onlyEnd());
    expect(hint(r)).toBeNull();
  });
});

describe('preset flow keeps its duration (BUG-24/27/33)', () => {
  it('both points set before: intermediate distance does not touch the preset duration', async () => {
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
    expect(hint(r)).toBeNull();
    mockSent.length = 0;
    await press(r, 'Start → Ende');
    expect(mockSent).toEqual([['auto', 'startToEnd', 3.5]]);
  });

  it('only an end point set before (BUG-27): preset duration stays', async () => {
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

  it('loading a second preset right after applying the first keeps the second one\'s duration (BUG-33)', async () => {
    await seed([SCHNELL, KURZ]);
    const r = await mount();
    await notify(both(20000));
    await press(r, 'Schnell');
    await press(r, 'Als Start setzen');
    await press(r, 'Kurz');
    expect(value(r)).toBe('1.0');
    await press(r, 'Als Start setzen');
    await notify(both(30000));
    await notify(both(2000));
    expect(value(r)).toBe('1.0');
    mockSent.length = 0;
    await press(r, 'Start → Ende');
    expect(mockSent).toEqual([['auto', 'startToEnd', 1]]);
  });

  it('while an intermediate distance makes the preset duration too short, the hint shows but nothing is overwritten', async () => {
    await seed([KURZ]);
    const r = await mount();
    await notify(both(100000));
    await press(r, 'Kurz');
    await press(r, 'Als Start setzen');
    await notify(both(50000)); // preset distance never arrives
    expect(value(r)).toBe('1.0');
    expect(hint(r)).toContain('7.3 s');
  });

  it('no timers are started by the preset flow (BUG-31/32/34/36)', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const setSpy = jest.spyOn(globalThis, 'setTimeout');
    await seed([SCHNELL]);
    const r = await mount();
    await notify(both(100000));
    await press(r, 'Schnell');
    await press(r, 'Als Start setzen');
    await press(r, 'Als Start setzen');
    expect(setSpy.mock.calls.filter(c => c[1] === 3000)).toHaveLength(0);
    setSpy.mockRestore();
    jest.useRealTimers();
  });
});

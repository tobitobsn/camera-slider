import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { Device } from 'react-native-ble-plx';

import { subscribeToStatus, type SliderStatus } from '../ble/client';
import { useSliderStatus } from './useSliderStatus';

// jest.mock calls are hoisted above these imports by babel-plugin-jest-hoist,
// matching ConnectionProvider.test.tsx's pattern for mocking this module.
jest.mock('../ble/client', () => ({
  subscribeToStatus: jest.fn(),
}));

const INITIAL_STATUS: SliderStatus = {
  hasStart: false,
  hasEnd: false,
  atStart: false,
  atEnd: false,
  driving: false,
  endIsAfterStart: null,
  distanceSteps: null,
  timelapseMoving: false,
  batteryMillivolts: null,
  batteryLocked: false,
  moving: false,
  lockReason: 'none',
  shutdownSeconds: null,
};

const OTHER_STATUS: SliderStatus = {
  hasStart: true,
  hasEnd: true,
  atStart: true,
  atEnd: false,
  driving: false,
  endIsAfterStart: true,
  distanceSteps: 12345,
  timelapseMoving: false,
  batteryMillivolts: null,
  batteryLocked: false,
  moving: false,
  lockReason: 'none',
  shutdownSeconds: null,
};

function fakeDevice(id: string): Device {
  return { id } as unknown as Device;
}

// Plain function component using React.createElement (not JSX) since this
// file is .ts, not .tsx — matches the project's other hook test file
// (useJogState.test.ts), which is also a plain .ts file, while borrowing
// ConnectionProvider.test.tsx's "render a probe component with
// react-test-renderer + act()" approach for exercising a hook that has
// React state and an effect.
function StatusProbe({
  device,
  onStatus,
}: {
  device: Device | null;
  onStatus: (status: SliderStatus) => void;
}) {
  const status = useSliderStatus(device);
  onStatus(status);
  return null;
}

function renderProbe(
  device: Device | null,
  onStatus: (status: SliderStatus) => void,
): React.ReactElement {
  return React.createElement(StatusProbe, { device, onStatus });
}

describe('useSliderStatus', () => {
  beforeEach(() => {
    (subscribeToStatus as jest.Mock).mockReset();
  });

  it('stays at the initial all-false/null shape when device is null', () => {
    let lastStatus: SliderStatus | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(null, s => (lastStatus = s)));
    });

    expect(lastStatus).toEqual(INITIAL_STATUS);
    expect(subscribeToStatus).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  it('subscribes with the given device and updates status when the callback fires', () => {
    let capturedCallback: ((status: SliderStatus) => void) | undefined;
    const unsubscribe = jest.fn();
    (subscribeToStatus as jest.Mock).mockImplementation((_device, callback) => {
      capturedCallback = callback;
      return unsubscribe;
    });

    const device = fakeDevice('device-1');
    let lastStatus: SliderStatus | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(device, s => (lastStatus = s)));
    });

    expect(subscribeToStatus).toHaveBeenCalledWith(device, expect.any(Function));
    expect(lastStatus).toEqual(INITIAL_STATUS);

    act(() => {
      capturedCallback?.(OTHER_STATUS);
    });

    expect(lastStatus).toEqual(OTHER_STATUS);

    act(() => renderer.unmount());
  });

  it('resets to the initial shape and unsubscribes when device goes from present to null (disconnect)', () => {
    let capturedCallback: ((status: SliderStatus) => void) | undefined;
    const unsubscribe = jest.fn();
    (subscribeToStatus as jest.Mock).mockImplementation((_device, callback) => {
      capturedCallback = callback;
      return unsubscribe;
    });

    const device = fakeDevice('device-1');
    let lastStatus: SliderStatus | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(device, s => (lastStatus = s)));
    });
    act(() => {
      capturedCallback?.(OTHER_STATUS);
    });
    expect(lastStatus).toEqual(OTHER_STATUS);
    expect(unsubscribe).not.toHaveBeenCalled();

    act(() => {
      renderer.update(renderProbe(null, s => (lastStatus = s)));
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(lastStatus).toEqual(INITIAL_STATUS);

    act(() => renderer.unmount());
  });

  it('unsubscribes the old device and subscribes the new one when device changes (reconnect to a fresh Device)', () => {
    const unsubscribeA = jest.fn();
    const unsubscribeB = jest.fn();
    let callbackB: ((status: SliderStatus) => void) | undefined;

    (subscribeToStatus as jest.Mock).mockImplementationOnce(() => unsubscribeA);

    const deviceA = fakeDevice('device-A');
    const deviceB = fakeDevice('device-B');
    let lastStatus: SliderStatus | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(deviceA, s => (lastStatus = s)));
    });

    expect(subscribeToStatus).toHaveBeenCalledWith(deviceA, expect.any(Function));
    expect(unsubscribeA).not.toHaveBeenCalled();

    (subscribeToStatus as jest.Mock).mockImplementationOnce((_device, callback) => {
      callbackB = callback;
      return unsubscribeB;
    });

    act(() => {
      renderer.update(renderProbe(deviceB, s => (lastStatus = s)));
    });

    expect(unsubscribeA).toHaveBeenCalledTimes(1);
    expect(subscribeToStatus).toHaveBeenCalledWith(deviceB, expect.any(Function));
    expect(unsubscribeB).not.toHaveBeenCalled();

    act(() => {
      callbackB?.(OTHER_STATUS);
    });
    expect(lastStatus).toEqual(OTHER_STATUS);

    act(() => renderer.unmount());
    expect(unsubscribeB).toHaveBeenCalledTimes(1);
  });
});

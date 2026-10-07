import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { Device } from 'react-native-ble-plx';

import { sendSetHoldCommand } from '../ble/client';
import { HOLD_PENDING_TIMEOUT_MS, useHoldSetting, type HoldSettingApi } from './useHoldSetting';

jest.mock('../ble/client', () => ({
  sendSetHoldCommand: jest.fn(),
}));

const mockSend = sendSetHoldCommand as jest.Mock;
const device = { id: 'dev' } as unknown as Device;

function Probe({
  dev,
  reported,
  onApi,
}: {
  dev: Device | null;
  reported: boolean | null;
  onApi: (api: HoldSettingApi) => void;
}) {
  onApi(useHoldSetting(dev, reported));
  return null;
}

function setup(reported: boolean | null, dev: Device | null = device) {
  let api!: HoldSettingApi;
  let r!: ReactTestRenderer.ReactTestRenderer;
  const onApi = (a: HoldSettingApi) => {
    api = a;
  };
  act(() => {
    r = ReactTestRenderer.create(React.createElement(Probe, { dev, reported, onApi }));
  });
  return {
    get api() {
      return api;
    },
    report(next: boolean | null) {
      act(() => {
        r.update(React.createElement(Probe, { dev, reported: next, onApi }));
      });
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSend.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useHoldSetting', () => {
  it('shows the reported value (AC-10, EC-9)', () => {
    expect(setup(true).api.value).toBe(true);
    expect(setup(false).api.value).toBe(false);
    expect(setup(null).api.value).toBeNull();
  });

  it('sends the toggle and shows the requested value until the slider confirms it', async () => {
    mockSend.mockResolvedValue(undefined);
    const h = setup(true);
    act(() => h.api.toggle(false));
    expect(mockSend).toHaveBeenCalledWith(device, false);
    expect(h.api.value).toBe(false);
    await act(async () => {});
    expect(h.api.value).toBe(false);
    h.report(false);
    expect(h.api.value).toBe(false);
    // confirmed: from now on only the reported value counts
    h.report(true);
    expect(h.api.value).toBe(true);
  });

  it('reverts to the reported value and raises sendFailed when the send fails', async () => {
    mockSend.mockRejectedValue(new Error('gatt'));
    const h = setup(true);
    act(() => h.api.toggle(false));
    await act(async () => {});
    expect(h.api.value).toBe(true);
    expect(h.api.sendFailed).toBe(true);
  });

  it('clears sendFailed on the next successful send', async () => {
    mockSend.mockRejectedValueOnce(new Error('gatt')).mockResolvedValueOnce(undefined);
    const h = setup(true);
    act(() => h.api.toggle(false));
    await act(async () => {});
    expect(h.api.sendFailed).toBe(true);
    act(() => h.api.toggle(false));
    await act(async () => {});
    expect(h.api.sendFailed).toBe(false);
  });

  it('drops the pending value after the timeout when no matching status arrives (EC-7)', async () => {
    mockSend.mockResolvedValue(undefined);
    const h = setup(true);
    act(() => h.api.toggle(false));
    await act(async () => {});
    expect(h.api.value).toBe(false);
    act(() => {
      jest.advanceTimersByTime(HOLD_PENDING_TIMEOUT_MS);
    });
    expect(h.api.value).toBe(true);
  });

  it('does nothing without a device', () => {
    const h = setup(true, null);
    act(() => h.api.toggle(false));
    expect(mockSend).not.toHaveBeenCalled();
    expect(h.api.value).toBe(true);
  });
});

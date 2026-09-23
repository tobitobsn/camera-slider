import { toByteArray } from 'base64-js';
import type { Device } from 'react-native-ble-plx';

import {
  SLIDER_COMMAND_CHAR_UUID,
  SLIDER_SERVICE_UUID,
  sendJogCommand,
  sendStopCommand,
} from './client';

type MockWritableDevice = {
  writeCharacteristicWithoutResponseForService: jest.Mock;
  writeCharacteristicWithResponseForService: jest.Mock;
};

function createMockDevice(): MockWritableDevice {
  return {
    writeCharacteristicWithoutResponseForService: jest.fn().mockResolvedValue(undefined),
    writeCharacteristicWithResponseForService: jest.fn().mockResolvedValue(undefined),
  };
}

describe('sendJogCommand', () => {
  it('writes opcode 0x01 + forward (0x00) + speed, without response', async () => {
    const device = createMockDevice();

    await sendJogCommand(device as unknown as Device, 'forward', 42);

    expect(device.writeCharacteristicWithoutResponseForService).toHaveBeenCalledTimes(1);
    const [serviceUUID, charUUID, base64Value] =
      device.writeCharacteristicWithoutResponseForService.mock.calls[0];
    expect(serviceUUID).toBe(SLIDER_SERVICE_UUID);
    expect(charUUID).toBe(SLIDER_COMMAND_CHAR_UUID);
    expect(Array.from(toByteArray(base64Value))).toEqual([0x01, 0x00, 42]);
    expect(device.writeCharacteristicWithResponseForService).not.toHaveBeenCalled();
  });

  it('encodes backward direction as 0x01', async () => {
    const device = createMockDevice();

    await sendJogCommand(device as unknown as Device, 'backward', 7);

    const [, , base64Value] = device.writeCharacteristicWithoutResponseForService.mock.calls[0];
    expect(Array.from(toByteArray(base64Value))).toEqual([0x01, 0x01, 7]);
  });

  it('passes speedPercent through as the raw third byte', async () => {
    const device = createMockDevice();

    await sendJogCommand(device as unknown as Device, 'forward', 100);

    const [, , base64Value] = device.writeCharacteristicWithoutResponseForService.mock.calls[0];
    expect(Array.from(toByteArray(base64Value))).toEqual([0x01, 0x00, 100]);
  });
});

describe('sendStopCommand', () => {
  it('writes opcode 0x05 with no payload, with response', async () => {
    const device = createMockDevice();

    await sendStopCommand(device as unknown as Device);

    expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
    const [serviceUUID, charUUID, base64Value] =
      device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(serviceUUID).toBe(SLIDER_SERVICE_UUID);
    expect(charUUID).toBe(SLIDER_COMMAND_CHAR_UUID);
    expect(Array.from(toByteArray(base64Value))).toEqual([0x05]);
    expect(device.writeCharacteristicWithoutResponseForService).not.toHaveBeenCalled();
  });
});

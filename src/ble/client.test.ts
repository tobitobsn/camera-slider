import { fromByteArray, toByteArray } from 'base64-js';
import type { Device } from 'react-native-ble-plx';

import {
  SLIDER_COMMAND_CHAR_UUID,
  SLIDER_SERVICE_UUID,
  sendJogCommand,
  sendStopCommand,
  sendSetStartCommand,
  sendSetEndCommand,
  sendAutoDriveCommand,
  sendSetEndFromDistanceCommand,
  sendTimelapseMoveCommand,
  parseStatusPayload,
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
  it('writes opcode 0x01 + forward (0x00) + speed, with response', async () => {
    const device = createMockDevice();

    await sendJogCommand(device as unknown as Device, 'forward', 42);

    expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
    const [serviceUUID, charUUID, base64Value] =
      device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(serviceUUID).toBe(SLIDER_SERVICE_UUID);
    expect(charUUID).toBe(SLIDER_COMMAND_CHAR_UUID);
    expect(Array.from(toByteArray(base64Value))).toEqual([0x01, 0x00, 42]);
    expect(device.writeCharacteristicWithoutResponseForService).not.toHaveBeenCalled();
  });

  it('encodes backward direction as 0x01', async () => {
    const device = createMockDevice();

    await sendJogCommand(device as unknown as Device, 'backward', 7);

    const [, , base64Value] = device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(Array.from(toByteArray(base64Value))).toEqual([0x01, 0x01, 7]);
  });

  it('passes speedPercent through as the raw third byte', async () => {
    const device = createMockDevice();

    await sendJogCommand(device as unknown as Device, 'forward', 100);

    const [, , base64Value] = device.writeCharacteristicWithResponseForService.mock.calls[0];
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

describe('sendSetStartCommand', () => {
  it('writes opcode 0x02 with no payload, with response', async () => {
    const device = createMockDevice();

    await sendSetStartCommand(device as unknown as Device);

    expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
    const [serviceUUID, charUUID, base64Value] =
      device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(serviceUUID).toBe(SLIDER_SERVICE_UUID);
    expect(charUUID).toBe(SLIDER_COMMAND_CHAR_UUID);
    expect(Array.from(toByteArray(base64Value))).toEqual([0x02]);
    expect(device.writeCharacteristicWithoutResponseForService).not.toHaveBeenCalled();
  });
});

describe('sendSetEndCommand', () => {
  it('writes opcode 0x03 with no payload, with response', async () => {
    const device = createMockDevice();

    await sendSetEndCommand(device as unknown as Device);

    expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
    const [serviceUUID, charUUID, base64Value] =
      device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(serviceUUID).toBe(SLIDER_SERVICE_UUID);
    expect(charUUID).toBe(SLIDER_COMMAND_CHAR_UUID);
    expect(Array.from(toByteArray(base64Value))).toEqual([0x03]);
    expect(device.writeCharacteristicWithoutResponseForService).not.toHaveBeenCalled();
  });
});

describe('sendAutoDriveCommand', () => {
  it('encodes startToEnd (0x00) + duration in tenths of a second, little-endian, with response', async () => {
    const device = createMockDevice();

    // 10.5s -> 105 deciseconds -> 0x69 0x00
    await sendAutoDriveCommand(device as unknown as Device, 'startToEnd', 10.5);

    expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
    const [serviceUUID, charUUID, base64Value] =
      device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(serviceUUID).toBe(SLIDER_SERVICE_UUID);
    expect(charUUID).toBe(SLIDER_COMMAND_CHAR_UUID);
    expect(Array.from(toByteArray(base64Value))).toEqual([0x04, 0x00, 0x69, 0x00]);
    expect(device.writeCharacteristicWithoutResponseForService).not.toHaveBeenCalled();
  });

  it('encodes endToStart as direction byte 0x01', async () => {
    const device = createMockDevice();

    await sendAutoDriveCommand(device as unknown as Device, 'endToStart', 5);

    const [, , base64Value] = device.writeCharacteristicWithResponseForService.mock.calls[0];
    // 5s -> 50 deciseconds -> 0x32 0x00
    expect(Array.from(toByteArray(base64Value))).toEqual([0x04, 0x01, 0x32, 0x00]);
  });

  it('rounds the duration to the nearest tenth of a second before encoding', async () => {
    const device = createMockDevice();

    // 1.24s rounds to 1.2s -> 12 deciseconds
    await sendAutoDriveCommand(device as unknown as Device, 'startToEnd', 1.24);

    const [, , base64Value] = device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(Array.from(toByteArray(base64Value))).toEqual([0x04, 0x00, 12, 0x00]);
  });

  it('encodes a duration spanning both duration bytes, little-endian', async () => {
    const device = createMockDevice();

    // 10000s -> 100000 deciseconds, clamped to uint16 max 65535
    await sendAutoDriveCommand(device as unknown as Device, 'startToEnd', 10000);

    const [, , base64Value] = device.writeCharacteristicWithResponseForService.mock.calls[0];
    const bytes = Array.from(toByteArray(base64Value));
    expect(bytes[0]).toBe(0x04);
    expect(bytes[1]).toBe(0x00);
    const decisecondsSent = bytes[2] | (bytes[3] << 8);
    expect(decisecondsSent).toBe(65535);
  });

  it('clamps a negative duration to 0 deciseconds defensively', async () => {
    const device = createMockDevice();

    await sendAutoDriveCommand(device as unknown as Device, 'startToEnd', -5);

    const [, , base64Value] = device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(Array.from(toByteArray(base64Value))).toEqual([0x04, 0x00, 0x00, 0x00]);
  });
});

describe('sendSetEndFromDistanceCommand', () => {
  it('encodes endIsAfterStart true (0x00) + distance, little-endian, with response', async () => {
    const device = createMockDevice();

    // 1234567 steps -> 0x12D687 -> LE bytes 0x87 0xD6 0x12 0x00
    await sendSetEndFromDistanceCommand(device as unknown as Device, true, 1234567);

    expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
    const [serviceUUID, charUUID, base64Value] =
      device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(serviceUUID).toBe(SLIDER_SERVICE_UUID);
    expect(charUUID).toBe(SLIDER_COMMAND_CHAR_UUID);
    expect(Array.from(toByteArray(base64Value))).toEqual([
      0x06, 0x00, 0x87, 0xd6, 0x12, 0x00,
    ]);
    expect(device.writeCharacteristicWithoutResponseForService).not.toHaveBeenCalled();
  });

  it('encodes endIsAfterStart false as direction byte 0x01', async () => {
    const device = createMockDevice();

    await sendSetEndFromDistanceCommand(device as unknown as Device, false, 1234567);

    const [, , base64Value] = device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(Array.from(toByteArray(base64Value))).toEqual([
      0x06, 0x01, 0x87, 0xd6, 0x12, 0x00,
    ]);
  });
});

describe('sendTimelapseMoveCommand', () => {
  it('encodes endIsAfterStart true (0x00) + distance, little-endian, with response', async () => {
    const device = createMockDevice();

    // 1234567 steps -> 0x12D687 -> LE bytes 0x87 0xD6 0x12 0x00
    await sendTimelapseMoveCommand(device as unknown as Device, true, 1234567);

    expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
    const [serviceUUID, charUUID, base64Value] =
      device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(serviceUUID).toBe(SLIDER_SERVICE_UUID);
    expect(charUUID).toBe(SLIDER_COMMAND_CHAR_UUID);
    expect(Array.from(toByteArray(base64Value))).toEqual([
      0x07, 0x00, 0x87, 0xd6, 0x12, 0x00,
    ]);
    expect(device.writeCharacteristicWithoutResponseForService).not.toHaveBeenCalled();
  });

  it('encodes endIsAfterStart false as direction byte 0x01', async () => {
    const device = createMockDevice();

    await sendTimelapseMoveCommand(device as unknown as Device, false, 1234567);

    const [, , base64Value] = device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(Array.from(toByteArray(base64Value))).toEqual([
      0x07, 0x01, 0x87, 0xd6, 0x12, 0x00,
    ]);
  });

  it('encodes a small distance spanning only the low byte, little-endian', async () => {
    const device = createMockDevice();

    await sendTimelapseMoveCommand(device as unknown as Device, true, 42);

    const [, , base64Value] = device.writeCharacteristicWithResponseForService.mock.calls[0];
    expect(Array.from(toByteArray(base64Value))).toEqual([0x07, 0x00, 42, 0x00, 0x00, 0x00]);
  });
});

describe('parseStatusPayload', () => {
  // qa-report.md REG-2: PROJ-4 grew the wire payload from 5 to 6 bytes, but
  // the pre-PROJ-4 5-byte test cases were replaced by 6-byte ones instead of
  // being kept alongside them — silently dropping the one guarantee that
  // actually matters across a firmware/app version mismatch: an app running
  // PROJ-4 code must still decode a still-not-yet-reflashed PROJ-3 firmware's
  // 5-byte notify correctly (`bytes[5] ?? 0` treats a missing byte 5 as
  // `endIsAfterStart: true` rather than throwing or misreading bytes 0-4).
  it('parses a legacy 5-byte payload (pre-PROJ-4 firmware) with endIsAfterStart defaulting true', () => {
    // flags: bit0 hasStart, bit1 hasEnd, bit2 atStart, bit3 atEnd, bit4 driving -> 0x1f; distance 300000 steps (uint32 LE); no byte 5
    const distance = 300000;
    const distanceBytes = [
      distance & 0xff,
      (distance >>> 8) & 0xff,
      (distance >>> 16) & 0xff,
      (distance >>> 24) & 0xff,
    ];
    const payload = fromByteArray(new Uint8Array([0x1f, ...distanceBytes]));

    const result = parseStatusPayload(payload);
    expect(result.hasStart).toBe(true);
    expect(result.hasEnd).toBe(true);
    expect(result.atStart).toBe(true);
    expect(result.atEnd).toBe(true);
    expect(result.driving).toBe(true);
    expect(result.distanceSteps).toBe(300000);
    expect(result.endIsAfterStart).toBe(true);
  });

  it('parses no start / no end, distanceSteps and endIsAfterStart null', () => {
    const payload = fromByteArray(new Uint8Array([0x00, 0, 0, 0, 0, 0]));

    expect(parseStatusPayload(payload)).toEqual({
      hasStart: false,
      hasEnd: false,
      atStart: false,
      atEnd: false,
      driving: false,
      distanceSteps: null,
      endIsAfterStart: null,
      timelapseMoving: false,
      // 6-byte payload = firmware before PROJ-6: no battery data
      batteryMillivolts: null,
      batteryLocked: false,
      moving: false,
      lockReason: 'none',
      shutdownSeconds: null,
    });
  });

  describe('PROJ-6 battery fields (8-byte payload)', () => {
    function payload8(flags: number, millivolts: number): string {
      return fromByteArray(
        new Uint8Array([flags, 0, 0, 0, 0, 0, millivolts & 0xff, (millivolts >>> 8) & 0xff]),
      );
    }

    it('reads the battery voltage as uint16 little-endian', () => {
      // 11 820 mV = 0x2E2C -> LE 0x2C 0x2E
      expect(parseStatusPayload(payload8(0x00, 11820)).batteryMillivolts).toBe(11820);
    });

    it('reads bit 6 as batteryLocked and bit 7 as moving, independently', () => {
      const locked = parseStatusPayload(payload8(0x40, 9200));
      expect(locked.batteryLocked).toBe(true);
      expect(locked.moving).toBe(false);
      const moving = parseStatusPayload(payload8(0x80, 12000));
      expect(moving.batteryLocked).toBe(false);
      expect(moving.moving).toBe(true);
      // the existing flags are unaffected by the new bits
      expect(parseStatusPayload(payload8(0xff, 12000)).timelapseMoving).toBe(true);
    });

    it('treats 0 mV (no value yet) and implausible values (> 13500 mV, BUG-7) as null', () => {
      expect(parseStatusPayload(payload8(0x00, 0)).batteryMillivolts).toBeNull();
      expect(parseStatusPayload(payload8(0x00, 13501)).batteryMillivolts).toBeNull();
      expect(parseStatusPayload(payload8(0x00, 13500)).batteryMillivolts).toBe(13500);
    });

    it('reads an 8-byte payload with bit 6 as reason lowBattery, no countdown', () => {
      const s = parseStatusPayload(payload8(0x40, 9200));
      expect(s.lockReason).toBe('lowBattery');
      expect(s.shutdownSeconds).toBeNull();
      expect(parseStatusPayload(payload8(0x00, 9200)).lockReason).toBe('none');
    });
  });

  describe('PROJ-6 refine: lock reason + shutdown countdown (10-byte payload)', () => {
    function payload8(flags: number, millivolts: number): string {
      return fromByteArray(
        new Uint8Array([flags, 0, 0, 0, 0, 0, millivolts & 0xff, (millivolts >>> 8) & 0xff]),
      );
    }

    function payload10(flags: number, reason: number, seconds: number): string {
      return fromByteArray(new Uint8Array([flags, 0, 0, 0, 0, 0, 0x2c, 0x2e, reason, seconds]));
    }

    it('reads byte 8 as the lock reason and byte 9 as seconds until shutdown', () => {
      const low = parseStatusPayload(payload10(0x40, 1, 42));
      expect(low.lockReason).toBe('lowBattery');
      expect(low.shutdownSeconds).toBe(42);
      const fault = parseStatusPayload(payload10(0x40, 2, 60));
      expect(fault.lockReason).toBe('measurementFault');
      expect(fault.shutdownSeconds).toBe(60);
    });

    it('ignores reason and seconds while not locked, and out-of-range seconds', () => {
      const unlocked = parseStatusPayload(payload10(0x00, 2, 30));
      expect(unlocked.lockReason).toBe('none');
      expect(unlocked.shutdownSeconds).toBeNull();
      expect(parseStatusPayload(payload10(0x40, 1, 0)).shutdownSeconds).toBeNull();
      expect(parseStatusPayload(payload10(0x40, 1, 61)).shutdownSeconds).toBeNull();
      // unknown reason byte while locked → treated as low battery
      expect(parseStatusPayload(payload10(0x40, 7, 5)).lockReason).toBe('lowBattery');
    });

    it('passes a low USB-only reading through (the "no battery" decision is battery.ts\'s)', () => {
      expect(parseStatusPayload(payload8(0x00, 40)).batteryMillivolts).toBe(40);
    });
  });

  it('parses hasStart + hasEnd with a nonzero distance and endIsAfterStart true', () => {
    // flags: bit0 hasStart, bit1 hasEnd -> 0x03; distance 300000 steps (uint32 LE); byte 5: 0x00 -> endIsAfterStart true
    const distance = 300000;
    const distanceBytes = [
      distance & 0xff,
      (distance >>> 8) & 0xff,
      (distance >>> 16) & 0xff,
      (distance >>> 24) & 0xff,
    ];
    const payload = fromByteArray(new Uint8Array([0x03, ...distanceBytes, 0x00]));

    const result = parseStatusPayload(payload);
    expect(result.hasStart).toBe(true);
    expect(result.hasEnd).toBe(true);
    expect(result.distanceSteps).toBe(300000);
    expect(result.endIsAfterStart).toBe(true);
  });

  it('parses endIsAfterStart false when byte 5 is 0x01', () => {
    // flags: bit0 hasStart, bit1 hasEnd -> 0x03; byte 5: 0x01 -> endIsAfterStart false
    const payload = fromByteArray(new Uint8Array([0x03, 10, 0, 0, 0, 0x01]));

    const result = parseStatusPayload(payload);
    expect(result.hasStart).toBe(true);
    expect(result.hasEnd).toBe(true);
    expect(result.endIsAfterStart).toBe(false);
  });

  it('parses the driving flag set', () => {
    // flags: bit0 hasStart, bit1 hasEnd, bit4 driving -> 0x13
    const payload = fromByteArray(new Uint8Array([0x13, 10, 0, 0, 0]));

    const result = parseStatusPayload(payload);
    expect(result.driving).toBe(true);
    expect(result.distanceSteps).toBe(10);
  });

  it('parses the driving flag unset', () => {
    // flags: bit0 hasStart, bit1 hasEnd -> 0x03 (bit4 not set)
    const payload = fromByteArray(new Uint8Array([0x03, 10, 0, 0, 0]));

    const result = parseStatusPayload(payload);
    expect(result.driving).toBe(false);
  });

  it('parses atStart and atEnd flags', () => {
    // flags: bit2 atStart, bit3 atEnd -> 0x0C (hasStart/hasEnd unset)
    const payload = fromByteArray(new Uint8Array([0x0c, 0, 0, 0, 0]));

    const result = parseStatusPayload(payload);
    expect(result.atStart).toBe(true);
    expect(result.atEnd).toBe(true);
    expect(result.hasStart).toBe(false);
    expect(result.hasEnd).toBe(false);
  });

  it('reports distanceSteps and endIsAfterStart as null when only hasStart is set, even with nonzero distance/direction bytes', () => {
    // flags: bit0 hasStart only -> 0x01; distance/direction bytes present but must be ignored
    const payload = fromByteArray(new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0x00]));

    const result = parseStatusPayload(payload);
    expect(result.hasStart).toBe(true);
    expect(result.hasEnd).toBe(false);
    expect(result.distanceSteps).toBeNull();
    expect(result.endIsAfterStart).toBeNull();
  });

  it('reports distanceSteps and endIsAfterStart as null when only hasEnd is set, even with nonzero distance/direction bytes', () => {
    // flags: bit1 hasEnd only -> 0x02; distance/direction bytes present but must be ignored
    const payload = fromByteArray(new Uint8Array([0x02, 0x01, 0x02, 0x03, 0x04, 0x01]));

    const result = parseStatusPayload(payload);
    expect(result.hasStart).toBe(false);
    expect(result.hasEnd).toBe(true);
    expect(result.distanceSteps).toBeNull();
    expect(result.endIsAfterStart).toBeNull();
  });

  it('parses timelapseMoving set (bit 5) without hasStart/hasEnd', () => {
    // flags: bit5 timelapseMoving only -> 0x20 (hasStart/hasEnd unset)
    const payload = fromByteArray(new Uint8Array([0x20, 0, 0, 0, 0, 0]));

    const result = parseStatusPayload(payload);
    expect(result.timelapseMoving).toBe(true);
    expect(result.hasStart).toBe(false);
    expect(result.hasEnd).toBe(false);
    expect(result.distanceSteps).toBeNull();
    expect(result.endIsAfterStart).toBeNull();
  });

  it('parses timelapseMoving unset (bit 5) without hasStart/hasEnd', () => {
    // flags: none set -> 0x00
    const payload = fromByteArray(new Uint8Array([0x00, 0, 0, 0, 0, 0]));

    const result = parseStatusPayload(payload);
    expect(result.timelapseMoving).toBe(false);
  });

  it('parses timelapseMoving set (bit 5) together with hasStart && hasEnd', () => {
    // flags: bit0 hasStart, bit1 hasEnd, bit5 timelapseMoving -> 0x23; distance 300000 steps (uint32 LE); byte 5: 0x00 -> endIsAfterStart true
    const distance = 300000;
    const distanceBytes = [
      distance & 0xff,
      (distance >>> 8) & 0xff,
      (distance >>> 16) & 0xff,
      (distance >>> 24) & 0xff,
    ];
    const payload = fromByteArray(new Uint8Array([0x23, ...distanceBytes, 0x00]));

    const result = parseStatusPayload(payload);
    expect(result.timelapseMoving).toBe(true);
    expect(result.hasStart).toBe(true);
    expect(result.hasEnd).toBe(true);
    expect(result.distanceSteps).toBe(300000);
    expect(result.endIsAfterStart).toBe(true);
  });

  it('parses timelapseMoving unset (bit 5) together with hasStart && hasEnd', () => {
    // flags: bit0 hasStart, bit1 hasEnd -> 0x03 (bit5 not set)
    const payload = fromByteArray(new Uint8Array([0x03, 10, 0, 0, 0, 0x00]));

    const result = parseStatusPayload(payload);
    expect(result.timelapseMoving).toBe(false);
    expect(result.hasStart).toBe(true);
    expect(result.hasEnd).toBe(true);
  });
});

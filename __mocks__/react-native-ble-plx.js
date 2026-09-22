// Manual mock for react-native-ble-plx — Jest auto-applies this for every
// test (root-level __mocks__ next to node_modules, per Jest's convention for
// node_modules packages), since the real BleManager requires a native BLE
// module that doesn't exist in the test environment.
class BleManager {
  onStateChange = jest.fn((listener, emitCurrentState) => {
    if (emitCurrentState) {
      listener('PoweredOn');
    }
    return { remove: jest.fn() };
  });

  startDeviceScan = jest.fn();

  stopDeviceScan = jest.fn();

  destroy = jest.fn();
}

module.exports = { BleManager };

// Manual mock for react-native-vision-camera — Jest auto-applies this for
// every test (root-level __mocks__ next to node_modules, per Jest's
// convention for node_modules packages, same as this project's existing
// react-native-ble-plx.js mock), since the real library touches the native
// "NitroModules" TurboModule at plain import time (react-native-nitro-modules),
// which doesn't exist in the test environment and crashes any test that
// merely imports a file importing this package — even one that never
// renders <Camera> or calls a hook. Individual test files (e.g.
// useCameraCapture.test.ts, TimelapseControls.test.ts) still declare their
// own more specific jest.mock() for this package, which overrides this one
// within that file — this global mock exists for every other test that only
// imports the module transitively (e.g. App.test.tsx rendering the whole
// tree) and never mocked it itself.
function Camera() {
  return null;
}

module.exports = {
  Camera,
  useCameraPermission: jest.fn(() => ({
    hasPermission: false,
    requestPermission: jest.fn().mockResolvedValue(false),
  })),
  useCameraDevice: jest.fn(() => undefined),
  usePhotoOutput: jest.fn(() => ({
    capturePhotoToFile: jest.fn().mockResolvedValue({ filePath: '/mock/photo.jpg' }),
  })),
};

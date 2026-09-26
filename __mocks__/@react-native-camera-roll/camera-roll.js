// Manual mock for @react-native-camera-roll/camera-roll — same reasoning as
// __mocks__/react-native-vision-camera.js: the real module touches the
// native "RNCCameraRoll" TurboModule at plain import time, which crashes any
// test that merely imports a file importing this package. useCameraCapture.test.ts
// declares its own more specific jest.mock() for this package, which
// overrides this one within that file.
module.exports = {
  CameraRoll: {
    save: jest.fn().mockResolvedValue('mock-camera-roll-uri'),
  },
};

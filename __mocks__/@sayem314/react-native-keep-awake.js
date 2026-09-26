// Manual mock for @sayem314/react-native-keep-awake — same reasoning as
// __mocks__/react-native-vision-camera.js: the real module touches the
// native "ReactNativeKCKeepAwake" TurboModule at plain import time, which
// crashes any test that merely imports a file importing this package.
// useKeepAwake.test.ts declares its own more specific jest.mock() for this
// package, which overrides this one within that file.
module.exports = {
  activateKeepAwake: jest.fn(),
  deactivateKeepAwake: jest.fn(),
};

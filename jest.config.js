module.exports = {
  preset: '@react-native/jest-preset',
  // react-native-ble-plx, @react-native-async-storage/async-storage (its
  // jest mock, used by usePresets.test.ts), and PROJ-5's camera/keep-awake
  // dependencies (react-native-vision-camera, @react-native-camera-roll,
  // react-native-nitro-modules + react-native-nitro-image — VisionCamera
  // Core's own runtime dependencies, see design.md — and @sayem314's
  // keep-awake package) all ship untranspiled ESM in node_modules; the
  // default preset ignores all of node_modules for transformation, so each
  // has to be carved out explicitly (the usual RN pattern for ESM-only
  // dependencies).
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-async-storage|react-native-ble-plx|react-native-vision-camera|@react-native-camera-roll|react-native-nitro-modules|react-native-nitro-image|@sayem314)/)',
  ],
};

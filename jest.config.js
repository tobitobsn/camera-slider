module.exports = {
  preset: '@react-native/jest-preset',
  // react-native-ble-plx and @react-native-async-storage/async-storage (its
  // jest mock, used by usePresets.test.ts) ship untranspiled ESM in
  // node_modules; the default preset ignores all of node_modules for
  // transformation, so both have to be carved out explicitly (the usual RN
  // pattern for ESM-only dependencies).
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-async-storage|react-native-ble-plx)/)',
  ],
};

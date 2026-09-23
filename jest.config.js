module.exports = {
  preset: '@react-native/jest-preset',
  // react-native-ble-plx ships untranspiled ESM in node_modules; the default
  // preset ignores all of node_modules for transformation, so it has to be
  // carved out explicitly (the usual RN pattern for ESM-only dependencies).
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-ble-plx)/)',
  ],
};

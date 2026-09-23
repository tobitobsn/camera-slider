/**
 * Camera Slider — control app (PROJ-1: BLE connection & pairing)
 *
 * @format
 */

import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ConnectionProvider } from './src/connection/ConnectionProvider';
import { RootScreen } from './src/screens/RootScreen';
import { colors } from './src/theme/colors';

// Dark is this app's only theme for now (docs/design-system.md) — a
// photo/video tool that doesn't blend on set, not something that follows
// the phone's system theme.
function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        <ConnectionProvider>
          <RootScreen />
        </ConnectionProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;

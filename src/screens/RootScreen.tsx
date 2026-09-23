import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ConnectionHeader } from '../components/ConnectionHeader';
import { BluetoothOffNotice } from '../components/BluetoothOffNotice';
import { JogControls } from '../components/JogControls';
import { NotFoundNotice } from '../components/NotFoundNotice';
import { PermissionDeniedNotice } from '../components/PermissionDeniedNotice';
import { PermissionRationale } from '../components/PermissionRationale';
import { ReconnectingBanner } from '../components/ReconnectingBanner';
import { ScanningIndicator } from '../components/ScanningIndicator';
import { useConnection } from '../connection/ConnectionProvider';
import { colors, spacing, typography } from '../theme/colors';

/**
 * The app's single screen (PROJ-1 owns the shell — see docs/app-shell.md).
 * ConnectionHeader is always visible; the content area below it shows
 * exactly one status notice, chosen by the current connection status,
 * except `reconnecting`, which overlays a banner on top of the (disabled)
 * placeholder content instead of replacing it — the rest of the UI stays
 * visible per the design, it just isn't interactive yet.
 */
export function RootScreen() {
  const { state } = useConnection();

  return (
    <View style={styles.container}>
      <ConnectionHeader />
      <View style={styles.content}>{renderContent(state.status)}</View>
    </View>
  );
}

function renderContent(status: ReturnType<typeof useConnection>['state']['status']) {
  switch (status) {
    case 'checking_permissions':
      // BUG-5 / BUG-9: was the (wrong) ScanningIndicator — no scan has
      // started yet at this point, only the permission dialog is pending.
      return <PermissionRationale />;
    case 'permission_denied':
      return <PermissionDeniedNotice />;
    case 'bluetooth_off':
      return <BluetoothOffNotice />;
    case 'scanning':
    case 'connecting':
      return <ScanningIndicator />;
    case 'not_found':
      return <NotFoundNotice />;
    case 'connected':
      return <JogControls />;
    case 'reconnecting':
      return (
        <View style={styles.reconnectingWrap}>
          <ReconnectingBanner />
          <View style={styles.disabled} pointerEvents="none">
            <ControlsPlaceholder />
          </View>
        </View>
      );
  }
}

/**
 * PROJ-2's real jog controls (JogControls) now cover the `connected` case.
 * This placeholder lives on only for `reconnecting`, where PROJ-1's design
 * keeps a disabled placeholder visible under the ReconnectingBanner rather
 * than the real controls (AC-7: not fully connected → controls stay hidden;
 * `device` is null in this state anyway, so JogControls would render
 * nothing here). PROJ-3 will need its own placeholder story for its screen.
 */
function ControlsPlaceholder() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        Steuerung folgt in einem späteren Feature.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  reconnectingWrap: {
    flex: 1,
  },
  disabled: {
    flex: 1,
    opacity: 0.4,
    marginTop: spacing.lg,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: colors.mutedForeground,
    fontSize: typography.size.base,
    textAlign: 'center',
  },
});

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AutoDriveControls } from '../components/AutoDriveControls';
import { BatteryLockBanner } from '../components/BatteryLockBanner';
import { ConnectionHeader } from '../components/ConnectionHeader';
import { BluetoothOffNotice } from '../components/BluetoothOffNotice';
import { JogControls } from '../components/JogControls';
import { NotFoundNotice } from '../components/NotFoundNotice';
import { PermissionDeniedNotice } from '../components/PermissionDeniedNotice';
import { PermissionRationale } from '../components/PermissionRationale';
import { ReconnectingBanner } from '../components/ReconnectingBanner';
import { ScanningIndicator } from '../components/ScanningIndicator';
import { TimelapseControls } from '../components/TimelapseControls';
import { useCameraCapture } from '../components/useCameraCapture';
import { useConnection } from '../connection/ConnectionProvider';
import { useSliderStatus } from '../components/useSliderStatus';
import { useTimelapseSequence, type TimelapseSequenceApi } from '../components/useTimelapseSequence';
import { colors, spacing, typography } from '../theme/colors';

type CameraCapture = ReturnType<typeof useCameraCapture>;

/**
 * The app's single screen (PROJ-1 owns the shell — see docs/app-shell.md).
 * ConnectionHeader is always visible; the content area below it shows
 * exactly one status notice, chosen by the current connection status,
 * except `reconnecting`, which overlays a banner on top of the (disabled)
 * placeholder content instead of replacing it — the rest of the UI stays
 * visible per the design, it just isn't interactive yet.
 */
export function RootScreen() {
  const { state, device } = useConnection();
  // Called once here rather than separately inside JogControls — its
  // `disabled` prop needs the `driving` flag too, so both controls share
  // this one subscription's status instead of each maintaining their own.
  // (AutoDriveControls also calls useSliderStatus(device) internally for
  // its own status needs — see its own file for why that duplication was
  // left as-is: a second lightweight JS listener on the same already-active
  // BLE notify subscription, not a second native subscription.)
  const status = useSliderStatus(device);
  // qa-report.md BUG-2: called here (once) rather than separately inside
  // TimelapseControls and useTimelapseSequence — each of those calling it
  // independently created its own, separate usePhotoOutput() instance, and
  // only one of the two ever got attached to the actual <Camera> component,
  // so a capture through the other one always failed. One call, passed down
  // to both.
  const cameraCapture = useCameraCapture();
  // PROJ-5 T6: called here (once) rather than inside TimelapseControls,
  // because — unlike useSliderStatus's lightweight status listener — this
  // hook owns the whole in-flight sequence (refs, timers, the run loop
  // itself). A second call from within TimelapseControls would start a
  // second, independent orchestrator instead of sharing state. Its full API
  // is threaded down as props; JogControls/AutoDriveControls also need
  // `isRunning` to lock themselves while a sequence is running.
  const timelapse = useTimelapseSequence(device, cameraCapture.capturePhoto);
  // qa-report.md BUG-17 (PROJ-2): true while a jog button is held, reported
  // up by JogControls via onJoggingChange — used below to disable the
  // ScrollView's own touch responder for the duration, see its own comment.
  const [jogging, setJogging] = useState(false);

  return (
    <View style={styles.container}>
      <ConnectionHeader />
      <View style={styles.content}>
        {renderContent(state.status, device, status.driving, status.batteryLocked, timelapse, cameraCapture, jogging, setJogging)}
      </View>
    </View>
  );
}

function renderContent(
  status: ReturnType<typeof useConnection>['state']['status'],
  device: ReturnType<typeof useConnection>['device'],
  driving: boolean,
  batteryLocked: boolean,
  timelapse: TimelapseSequenceApi,
  cameraCapture: CameraCapture,
  jogging: boolean,
  setJogging: (jogging: boolean) => void,
) {
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
      // AC-9 (PROJ-3): JogControls locks its buttons/slider while an
      // auto-drive is in progress — AutoDriveControls manages its own
      // locked state internally. PROJ-5 T6: both also lock while a
      // timelapse sequence is running (timelapse.isRunning), since a
      // sequence drives the carriage itself via TIMELAPSE_MOVE and a
      // concurrent jog/auto-drive command would fight it. Symmetrically,
      // TimelapseControls locks its own "start sequence" action while a
      // manual auto-drive is already in progress — it calls
      // useSliderStatus(device) itself (same pattern as AutoDriveControls)
      // and checks `status.driving` internally, so no separate `disabled`
      // prop is needed here for that direction.
      // Reported during PROJ-5's hardware test: JogControls + AutoDriveControls
      // + TimelapseControls (camera preview, inputs, progress) together no
      // longer fit a single screen — the permission-request button, well
      // below the fold, was unreachable with no way to scroll to it. A plain
      // View never clips content, so this was always going to happen once
      // enough sections stacked up; ScrollView is the fix, not a redesign of
      // any one section.
      return (
        <ScrollView
          style={styles.connectedStack}
          contentContainerStyle={styles.connectedStackContent}
          scrollEnabled={!jogging}
        >
          {/* PROJ-6 AC-9: after a low-battery protective stop the firmware
              rejects all motion until it reboots — say so, and lock the
              controls. TimelapseControls locks its own start button (it
              reads batteryLocked itself, like it reads `driving`). */}
          {batteryLocked ? <BatteryLockBanner /> : null}
          <JogControls
            disabled={driving || timelapse.isRunning || batteryLocked}
            onJoggingChange={setJogging}
          />
          <AutoDriveControls disabled={timelapse.isRunning || batteryLocked} />
          <TimelapseControls
            device={device}
            isRunning={timelapse.isRunning}
            currentShot={timelapse.currentShot}
            totalShots={timelapse.totalShots}
            remainingSeconds={timelapse.remainingSeconds}
            error={timelapse.error}
            start={timelapse.start}
            stop={timelapse.stop}
            hasPermission={cameraCapture.hasPermission}
            requestPermission={cameraCapture.requestPermission}
            cameraDevice={cameraCapture.cameraDevice}
            photoOutput={cameraCapture.photoOutput}
          />
        </ScrollView>
      );
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
 * PROJ-2's real jog controls (JogControls) and PROJ-3's auto-drive controls
 * (AutoDriveControls) now cover the `connected` case together. This
 * placeholder lives on only for `reconnecting`, where PROJ-1's design keeps
 * a disabled placeholder visible under the ReconnectingBanner rather than
 * the real controls (AC-7: not fully connected → controls stay hidden;
 * `device` is null in this state anyway, so both components would render
 * nothing here regardless).
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
  connectedStack: {
    flex: 1,
  },
  connectedStackContent: {
    paddingBottom: spacing.lg,
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

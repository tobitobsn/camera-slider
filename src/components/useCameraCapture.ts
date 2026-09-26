/**
 * Device-capability hook for PROJ-5's Zeitraffer-Modus: camera permission,
 * the back camera device + a photo output for `<Camera outputs={[photoOutput]} />`,
 * and a single `capturePhoto()` that takes a photo and saves it to the
 * device's normal photo gallery.
 *
 * This is a Level 1 building block only (see tasks.md T3) — it has no
 * knowledge of the timelapse sequence itself (shot count, interval,
 * stepping the slider between shots). That orchestration is
 * `useTimelapseSequence` (T5, a later task), which calls `capturePhoto()`
 * once per step.
 *
 * Library choice (design.md → "Kamera-Integration"): `react-native-vision-camera`
 * (Nitro-Modules-based, current API as of 2026-09-25 per Context7 —
 * `useCameraPermission()` / `useCameraDevice()` / `usePhotoOutput()` /
 * `capturePhotoToFile()`) requires React Native's New Architecture, which
 * this project already builds with (`newArchEnabled=true` in
 * android/gradle.properties). VisionCamera Core itself depends on
 * `react-native-nitro-modules` + `react-native-nitro-image` (its own
 * install docs — not just a peer-dependency warning, the library does not
 * load without them), so both are added alongside it even though
 * design.md's Dependencies list only names the top-level package.
 */
import { useCallback } from 'react';
import {
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  type CameraDevice,
} from 'react-native-vision-camera';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

/**
 * @returns
 *  - `hasPermission` / `requestPermission` — camera runtime permission
 *    (AC-5), straight passthrough of VisionCamera's `useCameraPermission()`.
 *  - `cameraDevice` — the back camera device for the `<Camera device={...} />`
 *    prop; `undefined` until VisionCamera has enumerated devices.
 *  - `photoOutput` — pass through to `<Camera outputs={[photoOutput]} />`;
 *    also what `capturePhoto()` below captures from.
 *  - `capturePhoto()` — captures a photo to a temp file and saves it into
 *    the device's photo gallery. Rejects (throws) if either the capture or
 *    the gallery save fails — this hook does not swallow or retry a
 *    failure, so `useTimelapseSequence` (T5) can treat a rejection as a
 *    failed shot and stop the sequence (spec.md AC-6).
 */
export function useCameraCapture(): {
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
  cameraDevice: CameraDevice | undefined;
  photoOutput: ReturnType<typeof usePhotoOutput>;
  capturePhoto: () => Promise<void>;
} {
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraDevice = useCameraDevice('back');
  const photoOutput = usePhotoOutput();

  const capturePhoto = useCallback(async (): Promise<void> => {
    const { filePath } = await photoOutput.capturePhotoToFile({}, {});
    // capturePhotoToFile() returns a plain filesystem path, explicitly NOT a
    // file:// URL (VisionCamera's PhotoFile.filePath doc comment). CameraRoll.save()
    // requires the opposite: its README says "the tag must be a local image
    // or video URI, such as file:///sdcard/img.png" — so the file:// scheme
    // is prepended here, at the boundary between the two libraries.
    await CameraRoll.save(`file://${filePath}`);
  }, [photoOutput]);

  return { hasPermission, requestPermission, cameraDevice, photoOutput, capturePhoto };
}

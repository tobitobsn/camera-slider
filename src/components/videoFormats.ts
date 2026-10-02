/**
 * Pure helpers for PROJ-3's video recording during an auto-drive (design.md →
 * "Angebotene Formate und Objektive"): which back lenses the app offers, which
 * resolution + fps combinations a lens offers, whether it supports video
 * stabilization, and which lens/format is actually used when a remembered one
 * is not available on this device (AC-22, AC-23, AC-24, AC-26).
 *
 * No React, no persistence — `useVideoSettings` stores the user's choice,
 * `useVideoCamera` feeds the camera with what these functions resolve.
 */
import type { CameraDevice } from 'react-native-vision-camera';

export type LensType = 'wide' | 'ultraWide' | 'tele';
export type VideoResolution = '720p' | '1080p' | '2160p';
export type VideoFps = 24 | 25 | 30 | 50 | 60;

export const LENS_TYPES: readonly LensType[] = ['wide', 'ultraWide', 'tele'];
export const VIDEO_RESOLUTIONS: readonly VideoResolution[] = ['720p', '1080p', '2160p'];
export const VIDEO_FPS: readonly VideoFps[] = [24, 25, 30, 50, 60];

export const DEFAULT_LENS: LensType = 'wide';
export const DEFAULT_RESOLUTION: VideoResolution = '1080p';
export const DEFAULT_FPS: VideoFps = 30;

/** Pixel size of each offered resolution (landscape). */
export const RESOLUTION_SIZES: Record<VideoResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2160p': { width: 3840, height: 2160 },
};

const RESOLUTION_LABELS: Record<VideoResolution, string> = {
  '720p': '720p',
  '1080p': '1080p',
  '2160p': '4K',
};

export const LENS_LABELS: Record<LensType, string> = {
  wide: 'Weitwinkel',
  ultraWide: 'Ultraweitwinkel',
  tele: 'Tele',
};

const DEVICE_TYPE_TO_LENS: Partial<Record<CameraDevice['type'], LensType>> = {
  'wide-angle': 'wide',
  'ultra-wide-angle': 'ultraWide',
  telephoto: 'tele',
};

/**
 * Logical multi-cameras (qa-report.md BUG-70): many phones (e.g. Galaxy S24)
 * expose their main camera only as one of these — it opens on the main lens
 * with autofocus. VisionCamera types it by the number of lenses inside.
 */
const MULTI_CAMERA_TYPES: readonly CameraDevice['type'][] = ['dual', 'dual-wide', 'triple', 'quad'];

export type VideoFormat = { resolution: VideoResolution; fps: VideoFps };

export type Lens = { type: LensType; device: CameraDevice };

/**
 * AC-23: every back camera whose type is wide / ultra-wide / tele, the first
 * one per type, in the order wide → ultra-wide → tele. A logical
 * multi-camera counts as wide and wins over a single wide-angle camera
 * (BUG-70, user decision 2026-10-02). A phone that only exposes one back
 * camera yields at most one lens.
 */
export function availableLenses(devices: readonly CameraDevice[]): Lens[] {
  const firstPerType = new Map<LensType, CameraDevice>();
  let multiCamera: CameraDevice | undefined;
  for (const device of devices) {
    if (device.position !== 'back') {
      continue;
    }
    if (MULTI_CAMERA_TYPES.includes(device.type)) {
      if (!multiCamera) {
        multiCamera = device;
      }
      continue;
    }
    const lensType = DEVICE_TYPE_TO_LENS[device.type];
    if (lensType !== undefined && !firstPerType.has(lensType)) {
      firstPerType.set(lensType, device);
    }
  }
  if (multiCamera) {
    firstPerType.set('wide', multiCamera);
  }
  return LENS_TYPES.filter(type => firstPerType.has(type)).map(type => ({
    type,
    device: firstPerType.get(type) as CameraDevice,
  }));
}

/**
 * AC-26: the lens actually used — the remembered one if this device has it,
 * otherwise wide, otherwise whatever lens exists. `undefined` only while the
 * device list is still empty.
 */
export function effectiveLens(lenses: readonly Lens[], remembered: LensType): Lens | undefined {
  return (
    lenses.find(lens => lens.type === remembered) ??
    lenses.find(lens => lens.type === DEFAULT_LENS) ??
    lenses[0]
  );
}

function supportsResolution(device: CameraDevice, resolution: VideoResolution): boolean {
  const { width, height } = RESOLUTION_SIZES[resolution];
  return device
    .getSupportedResolutions('video')
    .some(
      size =>
        (size.width === width && size.height === height) ||
        (size.width === height && size.height === width),
    );
}

/**
 * AC-22: the candidates — every combination of the three standard resolutions
 * and the five standard frame rates that this lens reports individually,
 * sorted by resolution, then fps. The lens reports frame rates per lens, not
 * per resolution (4K often only goes to 30 fps), so `probeFormats` narrows
 * this down to what the camera really delivers.
 */
export function availableFormats(device: CameraDevice): VideoFormat[] {
  const resolutions = VIDEO_RESOLUTIONS.filter(resolution => supportsResolution(device, resolution));
  const fpsValues = VIDEO_FPS.filter(fps => device.supportsFPS(fps));
  return resolutions.flatMap(resolution => fpsValues.map(fps => ({ resolution, fps })));
}

/** Asks the camera which frame rate it would actually use for this resolution and target fps. */
export type FpsResolver = (format: VideoFormat) => Promise<number | undefined>;

/**
 * AC-22 (qa-report.md BUG-47): keeps only the candidates the camera really
 * records at the chosen frame rate — it otherwise picks the nearest one
 * silently. A failed probe drops the combination.
 */
export async function probeFormats(
  candidates: readonly VideoFormat[],
  resolveFps: FpsResolver,
): Promise<VideoFormat[]> {
  const delivered = await Promise.all(
    candidates.map(format =>
      resolveFps(format).then(
        fps => fps === format.fps,
        () => false,
      ),
    ),
  );
  return candidates.filter((_, index) => delivered[index]);
}

/**
 * AC-22/AC-26: the format actually used — the remembered one if offered,
 * otherwise 1080p/30 if offered, otherwise the first offered combination.
 * `undefined` if the lens offers none of the standard combinations.
 */
export function effectiveFormat(
  formats: readonly VideoFormat[],
  remembered: VideoFormat,
): VideoFormat | undefined {
  const matches = (target: VideoFormat) => (format: VideoFormat) =>
    format.resolution === target.resolution && format.fps === target.fps;
  return (
    formats.find(matches(remembered)) ??
    formats.find(matches({ resolution: DEFAULT_RESOLUTION, fps: DEFAULT_FPS })) ??
    formats[0]
  );
}

/**
 * AC-24: the stabilization switch is only shown when the lens supports it.
 * Only 'standard' reflects the real capability — 'auto' is always "supported"
 * on Android and does not switch anything on (qa-report.md BUG-46).
 */
export const STABILIZATION_MODE = 'standard';

export function supportsStabilization(device: CameraDevice): boolean {
  return device.supportsVideoStabilizationMode(STABILIZATION_MODE);
}

/** Display label, e.g. "4K · 25 fps". */
export function formatLabel(format: VideoFormat): string {
  return `${RESOLUTION_LABELS[format.resolution]} · ${format.fps} fps`;
}

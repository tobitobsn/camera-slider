import type { CameraDevice } from 'react-native-vision-camera';

import {
  availableFormats,
  availableLenses,
  effectiveFormat,
  effectiveLens,
  formatLabel,
  supportsStabilization,
  type VideoFormat,
} from './videoFormats';

// Only the members videoFormats reads — cast, since CameraDevice is a large
// native HybridObject interface.
function fakeDevice({
  id = 'cam',
  type = 'wide-angle',
  position = 'back',
  resolutions = [{ width: 1920, height: 1080 }],
  fps = [30],
  stabilization = false,
}: {
  id?: string;
  type?: string;
  position?: string;
  resolutions?: { width: number; height: number }[];
  fps?: number[];
  stabilization?: boolean;
}): CameraDevice {
  return {
    id,
    type,
    position,
    getSupportedResolutions: (streamType: string) => (streamType === 'video' ? resolutions : []),
    supportsFPS: (value: number) => fps.includes(value),
    supportsVideoStabilizationMode: (mode: string) => stabilization && mode === 'auto',
  } as unknown as CameraDevice;
}

describe('availableLenses (AC-23)', () => {
  it('offers back wide/ultra-wide/tele lenses, first per type, in fixed order', () => {
    const lenses = availableLenses([
      fakeDevice({ id: 'tele', type: 'telephoto' }),
      fakeDevice({ id: 'front', type: 'wide-angle', position: 'front' }),
      fakeDevice({ id: 'wide-1', type: 'wide-angle' }),
      fakeDevice({ id: 'wide-2', type: 'wide-angle' }),
      fakeDevice({ id: 'multi', type: 'triple' }),
      fakeDevice({ id: 'uw', type: 'ultra-wide-angle' }),
    ]);

    expect(lenses.map(lens => [lens.type, lens.device.id])).toEqual([
      ['wide', 'wide-1'],
      ['ultraWide', 'uw'],
      ['tele', 'tele'],
    ]);
  });

  it('yields a single lens when the phone exposes only one back camera', () => {
    expect(availableLenses([fakeDevice({ type: 'wide-angle' })])).toHaveLength(1);
  });
});

describe('effectiveLens (AC-26)', () => {
  const wide = { type: 'wide' as const, device: fakeDevice({ id: 'w' }) };
  const tele = { type: 'tele' as const, device: fakeDevice({ id: 't' }) };

  it('uses the remembered lens when available', () => {
    expect(effectiveLens([wide, tele], 'tele')).toBe(tele);
  });

  it('falls back to wide when the remembered lens is missing', () => {
    expect(effectiveLens([tele, wide], 'ultraWide')).toBe(wide);
  });

  it('falls back to any lens when there is no wide lens', () => {
    expect(effectiveLens([tele], 'ultraWide')).toBe(tele);
  });

  it('is undefined while no lens is known', () => {
    expect(effectiveLens([], 'wide')).toBeUndefined();
  });
});

describe('availableFormats (AC-22)', () => {
  it('combines only the reported standard resolutions with the reported standard fps, sorted', () => {
    const device = fakeDevice({
      resolutions: [
        { width: 3840, height: 2160 },
        { width: 1920, height: 1080 },
        { width: 640, height: 480 },
      ],
      fps: [60, 30, 120],
    });

    expect(availableFormats(device)).toEqual([
      { resolution: '1080p', fps: 30 },
      { resolution: '1080p', fps: 60 },
      { resolution: '2160p', fps: 30 },
      { resolution: '2160p', fps: 60 },
    ]);
  });

  it('accepts a resolution reported in portrait orientation', () => {
    const device = fakeDevice({ resolutions: [{ width: 720, height: 1280 }], fps: [25] });
    expect(availableFormats(device)).toEqual([{ resolution: '720p', fps: 25 }]);
  });
});

describe('effectiveFormat (AC-22, AC-26)', () => {
  const formats: VideoFormat[] = [
    { resolution: '720p', fps: 60 },
    { resolution: '1080p', fps: 30 },
    { resolution: '2160p', fps: 25 },
  ];

  it('uses the remembered format when offered', () => {
    expect(effectiveFormat(formats, { resolution: '2160p', fps: 25 })).toEqual({
      resolution: '2160p',
      fps: 25,
    });
  });

  it('falls back to 1080p/30 when the remembered format is not offered', () => {
    expect(effectiveFormat(formats, { resolution: '2160p', fps: 60 })).toEqual({
      resolution: '1080p',
      fps: 30,
    });
  });

  it('falls back to the first offered format when 1080p/30 is not offered either', () => {
    expect(effectiveFormat([{ resolution: '720p', fps: 24 }], { resolution: '2160p', fps: 60 })).toEqual({
      resolution: '720p',
      fps: 24,
    });
  });

  it('is undefined when the lens offers no standard format', () => {
    expect(effectiveFormat([], { resolution: '1080p', fps: 30 })).toBeUndefined();
  });
});

describe('supportsStabilization (AC-24)', () => {
  it('reflects whether the lens supports automatic video stabilization', () => {
    expect(supportsStabilization(fakeDevice({ stabilization: true }))).toBe(true);
    expect(supportsStabilization(fakeDevice({ stabilization: false }))).toBe(false);
  });
});

describe('formatLabel', () => {
  it('names 2160p "4K"', () => {
    expect(formatLabel({ resolution: '2160p', fps: 25 })).toBe('4K · 25 fps');
    expect(formatLabel({ resolution: '1080p', fps: 30 })).toBe('1080p · 30 fps');
  });
});

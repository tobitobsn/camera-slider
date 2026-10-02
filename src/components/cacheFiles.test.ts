/**
 * PROJ-3 AC-15/AC-18 (qa-report.md BUG-48): cleaning up the app cache after a
 * take must never fail the take — the JS side forwards to the native
 * CacheFiles module, swallows its errors, and does nothing without it.
 */
import { NativeModules } from 'react-native';

import { deleteCacheFile, deleteLeftoverVideos } from './cacheFiles';

const flush = () => new Promise<void>(r => setImmediate(() => r()));

// Jest runs on Node; the RN TypeScript config has no Node types.
declare const process: {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
};

afterEach(() => {
  delete (NativeModules as Record<string, unknown>).CacheFiles;
});

describe('cacheFiles (AC-15, BUG-48)', () => {
  it('forwards the recorded path and the start-up sweep to the native module', async () => {
    const native = {
      deleteFile: jest.fn().mockResolvedValue(true),
      deleteLeftoverVideos: jest.fn().mockResolvedValue(2),
    };
    (NativeModules as Record<string, unknown>).CacheFiles = native;

    deleteCacheFile('/data/user/0/app/cache/VisionCamera_1.mp4');
    deleteLeftoverVideos();
    await flush();

    expect(native.deleteFile).toHaveBeenCalledTimes(1);
    expect(native.deleteFile).toHaveBeenCalledWith('/data/user/0/app/cache/VisionCamera_1.mp4');
    expect(native.deleteLeftoverVideos).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected native call instead of surfacing an unhandled rejection', async () => {
    const native = {
      deleteFile: jest.fn().mockRejectedValue(new Error('EACCES')),
      deleteLeftoverVideos: jest.fn().mockRejectedValue(new Error('EIO')),
    };
    (NativeModules as Record<string, unknown>).CacheFiles = native;
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);

    try {
      expect(() => deleteCacheFile('/cache/VisionCamera_2.mp4')).not.toThrow();
      expect(() => deleteLeftoverVideos()).not.toThrow();
      await flush();
      await flush();
    } finally {
      process.off('unhandledRejection', unhandled);
    }

    expect(native.deleteFile).toHaveBeenCalledTimes(1);
    expect(native.deleteLeftoverVideos).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('does nothing when the native module is missing (tests, a build without it)', () => {
    expect(NativeModules.CacheFiles).toBeUndefined();
    expect(() => deleteCacheFile('/cache/VisionCamera_3.mp4')).not.toThrow();
    expect(() => deleteLeftoverVideos()).not.toThrow();
  });
});

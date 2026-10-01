/**
 * JS side of the app's own `CacheFiles` native module
 * (android/app/src/main/java/com/camerasliderapp/CacheFilesModule.kt):
 * removes recorded videos from the app cache once they are in the gallery
 * (PROJ-3, qa-report.md BUG-48).
 *
 * Cleaning up is never allowed to fail a take — every call swallows errors
 * and does nothing where the module is missing (tests, a build without it).
 */
import { NativeModules } from 'react-native';

type CacheFilesNative = {
  deleteFile: (path: string) => Promise<boolean>;
  deleteLeftoverVideos: () => Promise<number>;
};

function nativeModule(): CacheFilesNative | undefined {
  return NativeModules.CacheFiles as CacheFilesNative | undefined;
}

/** Deletes one recorded file from the app cache. */
export function deleteCacheFile(path: string): void {
  nativeModule()
    ?.deleteFile(path)
    .catch(() => {});
}

/** Deletes recordings left in the cache by an earlier run (crash, lost hand-over). */
export function deleteLeftoverVideos(): void {
  nativeModule()
    ?.deleteLeftoverVideos()
    .catch(() => {});
}

package com.camerasliderapp

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File

/**
 * PROJ-3 (qa-report.md BUG-48): VisionCamera records each take into the app
 * cache, and CameraRoll only copies it into the gallery — the cache copy
 * would stay behind for good. This module removes those copies.
 *
 * It only ever deletes files inside the app's own cache directory, whatever
 * path it is handed.
 */
@ReactModule(name = CacheFilesModule.NAME)
class CacheFilesModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  private fun cacheDir(): File = reactApplicationContext.cacheDir.canonicalFile

  private fun isInCache(file: File): Boolean =
    file.canonicalPath.startsWith(cacheDir().canonicalPath + File.separator)

  /** Deletes one file if it lies inside the app cache. Resolves whether it was deleted. */
  @ReactMethod
  fun deleteFile(path: String, promise: Promise) {
    try {
      val file = File(path.removePrefix("file://")).canonicalFile
      promise.resolve(isInCache(file) && file.isFile && file.delete())
    } catch (e: Exception) {
      promise.reject("E_CACHE_FILES", e)
    }
  }

  /**
   * Deletes the recordings VisionCamera left in the cache root
   * (`VisionCamera_*.mp4` — its temp-file naming) after a crash or a lost
   * hand-over. Called at app start, when nothing records. Resolves the count.
   */
  @ReactMethod
  fun deleteLeftoverVideos(promise: Promise) {
    try {
      val leftovers =
        cacheDir().listFiles { file ->
          file.isFile && file.name.startsWith("VisionCamera_") && file.name.endsWith(".mp4")
        } ?: emptyArray()
      promise.resolve(leftovers.count { it.delete() })
    } catch (e: Exception) {
      promise.reject("E_CACHE_FILES", e)
    }
  }

  companion object {
    const val NAME = "CacheFiles"
  }
}

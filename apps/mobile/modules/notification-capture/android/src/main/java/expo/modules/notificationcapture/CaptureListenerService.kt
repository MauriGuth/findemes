package expo.modules.notificationcapture

import android.app.Notification
import android.content.ComponentName
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.Executors

/**
 * The only place notification content is read. Order matters: the package is checked
 * against the whitelist BEFORE touching extras, so WhatsApp or any other app never has its
 * text read, stored or sent (CLAUDE.md: estricta whitelist, nunca mensajería).
 */
class CaptureListenerService : NotificationListenerService() {
  private val executor = Executors.newSingleThreadExecutor()
  private val recentKeys = LinkedHashMap<String, Long>()

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val store = CaptureStore.get(applicationContext)
    if (!store.isWhitelisted(sbn.packageName)) return

    val notification = sbn.notification ?: return
    if (sbn.isOngoing) return
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    if (isRepeat(sbn.key)) return

    val extras = notification.extras
    val captured =
      CapturedNotification(
        id = 0,
        key = sbn.key,
        packageName = sbn.packageName,
        postedAt = sbn.postTime,
        title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.take(4000),
        text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.take(4000),
        bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.take(4000),
        subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.take(4000),
      )
    if (listOf(captured.title, captured.text, captured.bigText).all { it.isNullOrBlank() }) return

    executor.execute {
      store.markCaptured()
      if (store.captureMode()) store.addSample(captured)
      if (store.token() == null) return@execute
      store.enqueue(captured)
      if (Uploader.flush(applicationContext) == FlushResult.RETRY) {
        UploadWorker.schedule(applicationContext)
      }
    }
  }

  /** Same key within 60 s = an update of the same notification (progress, re-post). */
  @Synchronized
  private fun isRepeat(key: String): Boolean {
    val now = System.currentTimeMillis()
    recentKeys.entries.removeAll { now - it.value > 60_000 }
    val seen = recentKeys.containsKey(key)
    recentKeys[key] = now
    return seen
  }

  override fun onListenerDisconnected() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      requestRebind(ComponentName(this, CaptureListenerService::class.java))
    }
  }

  override fun onDestroy() {
    executor.shutdown()
    super.onDestroy()
  }
}

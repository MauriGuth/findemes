package expo.modules.notificationcapture

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Retry path: runs when there is network, with exponential backoff, even if the app is
 * closed or the phone rebooted. The first attempt happens right away in the listener.
 */
class UploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result =
    when (Uploader.flush(applicationContext)) {
      FlushResult.DONE -> Result.success()
      FlushResult.RETRY -> Result.retry()
    }

  companion object {
    private const val NAME = "findemes-capture-upload"

    fun schedule(context: Context) {
      val request =
        OneTimeWorkRequest.Builder(UploadWorker::class.java)
          .setConstraints(
            Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
          )
          .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
          .build()
      WorkManager.getInstance(context)
        .enqueueUniqueWork(NAME, ExistingWorkPolicy.KEEP, request)
    }
  }
}

package expo.modules.notificationcapture

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationCaptureModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val component: ComponentName
    get() = ComponentName(context, CaptureListenerService::class.java)

  override fun definition() = ModuleDefinition {
    Name("NotificationCapture")

    /** Whether the user granted notification access to Findemes. */
    Function("isEnabled") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        context.getSystemService(NotificationManager::class.java)
          .isNotificationListenerAccessGranted(component)
      } else {
        val enabled =
          Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
        enabled?.split(":")?.any { ComponentName.unflattenFromString(it) == component } == true
      }
    }

    /** Opens Android's notification access screen, on Findemes itself when the OS allows it. */
    Function("openSettings") {
      val detail =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
            .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component.flattenToString())
        } else {
          null
        }
      val intent = detail ?: Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (e: Exception) {
        context.startActivity(
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
    }

    /** App info screen: where "Allow restricted settings" lives (Android 13+, sideloaded APKs). */
    Function("openAppDetails") {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    Function("setWhitelist") { packages: List<String> ->
      CaptureStore.get(context).setWhitelist(packages)
    }

    Function("setAuthToken") { token: String, apiUrl: String ->
      CaptureStore.get(context).setAuth(token, apiUrl)
      UploadWorker.schedule(context)
    }

    Function("clearAuthToken") {
      CaptureStore.get(context).clearAuth()
    }

    Function("getQueueStats") {
      CaptureStore.get(context).stats()
    }

    /** Retries the queue now (e.g. when the app opens). */
    Function("flush") {
      UploadWorker.schedule(context)
    }

    Function("setCaptureMode") { on: Boolean ->
      CaptureStore.get(context).setCaptureMode(on)
    }

    Function("getCaptureMode") {
      CaptureStore.get(context).captureMode()
    }

    Function("getCapturedSamples") {
      CaptureStore.get(context).samples().map { it.toMap() }
    }

    Function("clearCapturedSamples") {
      CaptureStore.get(context).clearSamples()
    }
  }
}

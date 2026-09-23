package expo.modules.notificationcapture

import android.content.Context
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/** Result of one flush attempt. RETRY hands the rest to WorkManager's backoff. */
internal enum class FlushResult { DONE, RETRY }

/**
 * Sends the queue to POST /ingest/notifications in batches of 50 and refreshes the
 * whitelist from GET /ingest/config every few hours. Runs on a background thread (the
 * listener's executor or UploadWorker); never logs notification text.
 */
internal object Uploader {
  private const val BATCH = 50
  private const val MAX_BATCHES = 10
  private const val CONFIG_EVERY_MS = 6 * 60 * 60 * 1000L
  private const val TIMEOUT_MS = 20_000

  @Synchronized
  fun flush(context: Context): FlushResult {
    val store = CaptureStore.get(context)
    val token = store.token() ?: return FlushResult.DONE
    val apiUrl = store.apiUrl() ?: return FlushResult.DONE

    try {
      if (System.currentTimeMillis() - store.configFetchedAt() > CONFIG_EVERY_MS) {
        val (code, body) = request("GET", "$apiUrl/ingest/config", token, null)
        if (code == 401) return unauthorized(store)
        if (code == 200 && body != null) {
          val packages = JSONObject(body).getJSONArray("packages")
          store.setWhitelist((0 until packages.length()).map { packages.getString(it) })
        }
      }

      repeat(MAX_BATCHES) {
        val batch = store.peek(BATCH)
        if (batch.isEmpty()) return FlushResult.DONE
        val payload = JSONObject().put("items", JSONArray(batch.map { it.toJson() }))
        val (code, _) = request("POST", "$apiUrl/ingest/notifications", token, payload.toString())
        when {
          code == 200 -> {
            store.remove(batch.map { it.id })
            store.markSent(batch.size)
          }
          code == 401 -> return unauthorized(store)
          code == 400 || code == 413 -> {
            // The API will never accept this batch: drop it instead of looping forever.
            store.remove(batch.map { it.id })
            store.markDropped(batch.size)
            store.setError("rejected")
          }
          else -> {
            store.setError(if (code == 503) "unavailable" else "http_$code")
            return FlushResult.RETRY
          }
        }
      }
      return if (store.peek(1).isEmpty()) FlushResult.DONE else FlushResult.RETRY
    } catch (e: IOException) {
      store.setError("offline")
      return FlushResult.RETRY
    } catch (e: Exception) {
      store.setError("error")
      return FlushResult.RETRY
    }
  }

  private fun unauthorized(store: CaptureStore): FlushResult {
    store.clearAuth()
    store.setError("unauthorized")
    return FlushResult.DONE
  }

  private fun request(method: String, url: String, token: String, body: String?): Pair<Int, String?> {
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
      connection.requestMethod = method
      connection.connectTimeout = TIMEOUT_MS
      connection.readTimeout = TIMEOUT_MS
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.setRequestProperty("Accept", "application/json")
      if (body != null) {
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      }
      val code = connection.responseCode
      val text =
        if (code in 200..299) connection.inputStream.bufferedReader().use { it.readText() } else null
      return code to text
    } finally {
      connection.disconnect()
    }
  }
}

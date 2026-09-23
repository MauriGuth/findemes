package expo.modules.notificationcapture

import android.content.ContentValues
import android.content.Context
import android.content.SharedPreferences
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONObject

internal data class CapturedNotification(
  val id: Long,
  val key: String,
  val packageName: String,
  val postedAt: Long,
  val title: String?,
  val text: String?,
  val bigText: String?,
  val subText: String?,
) {
  fun toJson(): JSONObject =
    JSONObject()
      .put("key", key)
      .put("packageName", packageName)
      .put("postedAt", isoUtc(postedAt))
      .put("title", title ?: JSONObject.NULL)
      .put("text", text ?: JSONObject.NULL)
      .put("bigText", bigText ?: JSONObject.NULL)
      .put("subText", subText ?: JSONObject.NULL)

  fun toMap(): Map<String, Any?> =
    mapOf(
      "packageName" to packageName,
      "postedAt" to isoUtc(postedAt),
      "title" to title,
      "text" to text,
      "bigText" to bigText,
      "subText" to subText,
    )

  companion object {
    fun isoUtc(millis: Long): String {
      val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
      format.timeZone = TimeZone.getTimeZone("UTC")
      return format.format(Date(millis))
    }
  }
}

/**
 * The upload queue and the dev capture-mode samples (SQLite, app-private), plus settings
 * (SharedPreferences). The ingest token is stored sealed by SecretBox. Shared by the
 * listener service, the upload worker and the JS module, so every method is synchronized.
 */
internal class CaptureStore private constructor(context: Context) :
  SQLiteOpenHelper(context, "findemes_capture.db", null, 1) {

  private val prefs: SharedPreferences =
    context.getSharedPreferences("findemes.capture", Context.MODE_PRIVATE)

  override fun onCreate(db: SQLiteDatabase) {
    for (table in listOf(QUEUE, SAMPLES)) {
      db.execSQL(
        "CREATE TABLE $table (id INTEGER PRIMARY KEY AUTOINCREMENT, nkey TEXT NOT NULL, " +
          "package TEXT NOT NULL, posted_at INTEGER NOT NULL, title TEXT, body TEXT, " +
          "big_text TEXT, sub_text TEXT)"
      )
    }
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  // ── settings ──

  @Synchronized fun whitelist(): Set<String> = prefs.getStringSet(K_WHITELIST, emptySet()) ?: emptySet()

  @Synchronized
  fun setWhitelist(packages: Collection<String>) {
    prefs.edit().putStringSet(K_WHITELIST, packages.toSet()).putLong(K_CONFIG_AT, now()).apply()
  }

  @Synchronized fun isWhitelisted(packageName: String): Boolean = whitelist().contains(packageName)

  @Synchronized fun configFetchedAt(): Long = prefs.getLong(K_CONFIG_AT, 0)

  @Synchronized
  fun token(): String? = prefs.getString(K_TOKEN, null)?.let { SecretBox.decrypt(it) }

  @Synchronized fun apiUrl(): String? = prefs.getString(K_API_URL, null)

  @Synchronized
  fun setAuth(token: String, apiUrl: String) {
    prefs.edit()
      .putString(K_TOKEN, SecretBox.encrypt(token))
      .putString(K_API_URL, apiUrl.trimEnd('/'))
      .remove(K_ERROR)
      .apply()
  }

  /** Logout, account deletion, capture off, or a 401: the queue goes too. */
  @Synchronized
  fun clearAuth() {
    prefs.edit().remove(K_TOKEN).apply()
    writableDatabase.delete(QUEUE, null, null)
  }

  @Synchronized fun captureMode(): Boolean = prefs.getBoolean(K_CAPTURE_MODE, false)

  @Synchronized fun setCaptureMode(on: Boolean) = prefs.edit().putBoolean(K_CAPTURE_MODE, on).apply()

  @Synchronized fun setError(error: String?) = prefs.edit().putString(K_ERROR, error).apply()

  @Synchronized
  fun markSent(count: Int) {
    prefs.edit()
      .putLong(K_SENT, prefs.getLong(K_SENT, 0) + count)
      .putLong(K_LAST_UPLOAD, now())
      .remove(K_ERROR)
      .apply()
  }

  @Synchronized
  fun markDropped(count: Int) = prefs.edit().putLong(K_DROPPED, prefs.getLong(K_DROPPED, 0) + count).apply()

  @Synchronized fun markCaptured() = prefs.edit().putLong(K_LAST_CAPTURE, now()).apply()

  @Synchronized
  fun stats(): Map<String, Any?> =
    mapOf(
      "pending" to count(QUEUE),
      "sent" to prefs.getLong(K_SENT, 0).toDouble(),
      "dropped" to prefs.getLong(K_DROPPED, 0).toDouble(),
      "lastUploadAt" to prefs.getLong(K_LAST_UPLOAD, 0).takeIf { it > 0 }?.let { CapturedNotification.isoUtc(it) },
      "lastCaptureAt" to prefs.getLong(K_LAST_CAPTURE, 0).takeIf { it > 0 }?.let { CapturedNotification.isoUtc(it) },
      "lastError" to prefs.getString(K_ERROR, null),
      "hasToken" to (prefs.getString(K_TOKEN, null) != null),
      "whitelistSize" to whitelist().size,
    )

  // ── queue and samples ──

  @Synchronized
  fun enqueue(n: CapturedNotification) {
    val db = writableDatabase
    db.insert(QUEUE, null, values(n))
    val overflow = count(QUEUE) - MAX_QUEUE
    if (overflow > 0) {
      db.execSQL("DELETE FROM $QUEUE WHERE id IN (SELECT id FROM $QUEUE ORDER BY id ASC LIMIT $overflow)")
      markDropped(overflow)
    }
  }

  @Synchronized fun peek(limit: Int): List<CapturedNotification> = read(QUEUE, "id ASC", limit)

  @Synchronized
  fun remove(ids: List<Long>) {
    if (ids.isEmpty()) return
    writableDatabase.execSQL("DELETE FROM $QUEUE WHERE id IN (${ids.joinToString(",")})")
  }

  @Synchronized
  fun addSample(n: CapturedNotification) {
    val db = writableDatabase
    db.insert(SAMPLES, null, values(n))
    db.execSQL(
      "DELETE FROM $SAMPLES WHERE id NOT IN (SELECT id FROM $SAMPLES ORDER BY id DESC LIMIT $MAX_SAMPLES)"
    )
  }

  @Synchronized fun samples(): List<CapturedNotification> = read(SAMPLES, "id DESC", MAX_SAMPLES)

  @Synchronized fun clearSamples() = writableDatabase.delete(SAMPLES, null, null).let { }

  private fun values(n: CapturedNotification) =
    ContentValues().apply {
      put("nkey", n.key)
      put("package", n.packageName)
      put("posted_at", n.postedAt)
      put("title", n.title)
      put("body", n.text)
      put("big_text", n.bigText)
      put("sub_text", n.subText)
    }

  private fun read(table: String, order: String, limit: Int): List<CapturedNotification> {
    val rows = mutableListOf<CapturedNotification>()
    readableDatabase
      .query(table, null, null, null, null, null, order, limit.toString())
      .use { c ->
        while (c.moveToNext()) {
          rows.add(
            CapturedNotification(
              id = c.getLong(c.getColumnIndexOrThrow("id")),
              key = c.getString(c.getColumnIndexOrThrow("nkey")),
              packageName = c.getString(c.getColumnIndexOrThrow("package")),
              postedAt = c.getLong(c.getColumnIndexOrThrow("posted_at")),
              title = c.getString(c.getColumnIndexOrThrow("title")),
              text = c.getString(c.getColumnIndexOrThrow("body")),
              bigText = c.getString(c.getColumnIndexOrThrow("big_text")),
              subText = c.getString(c.getColumnIndexOrThrow("sub_text")),
            )
          )
        }
      }
    return rows
  }

  private fun count(table: String): Int =
    readableDatabase.rawQuery("SELECT COUNT(*) FROM $table", null).use { c ->
      if (c.moveToFirst()) c.getInt(0) else 0
    }

  private fun now() = System.currentTimeMillis()

  companion object {
    private const val QUEUE = "queue"
    private const val SAMPLES = "samples"
    private const val MAX_QUEUE = 500
    private const val MAX_SAMPLES = 50
    private const val K_WHITELIST = "whitelist"
    private const val K_CONFIG_AT = "config_at"
    private const val K_TOKEN = "token"
    private const val K_API_URL = "api_url"
    private const val K_CAPTURE_MODE = "capture_mode"
    private const val K_ERROR = "last_error"
    private const val K_SENT = "sent"
    private const val K_DROPPED = "dropped"
    private const val K_LAST_UPLOAD = "last_upload_at"
    private const val K_LAST_CAPTURE = "last_capture_at"

    @Volatile private var instance: CaptureStore? = null

    fun get(context: Context): CaptureStore =
      instance ?: synchronized(this) {
        instance ?: CaptureStore(context.applicationContext).also { instance = it }
      }
  }
}

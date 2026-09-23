package expo.modules.notificationcapture

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AES-256-GCM with a key that never leaves the Android Keystore. Holds the ingest token
 * (ADR 009). EncryptedSharedPreferences is deprecated since security-crypto 1.1.0.
 */
internal object SecretBox {
  private const val ALIAS = "findemes.notification-capture.v1"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val IV_BYTES = 12

  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  fun encrypt(plain: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val sealed = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(sealed, Base64.NO_WRAP)
  }

  /** Null when the blob is corrupt or the key is gone (app data cleared, device restored). */
  fun decrypt(blob: String): String? =
    try {
      val all = Base64.decode(blob, Base64.NO_WRAP)
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, all.copyOfRange(0, IV_BYTES)))
      String(cipher.doFinal(all.copyOfRange(IV_BYTES, all.size)), Charsets.UTF_8)
    } catch (e: Exception) {
      null
    }
}

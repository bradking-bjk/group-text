package expo.modules.smsgateway

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** Sends texts through the phone's own SIM using Android's SmsManager. */
object SmsSender {
  private const val SENT_ACTION = "expo.modules.smsgateway.SMS_SENT"
  private const val TIMEOUT_MS = 60_000L
  private val counter = AtomicInteger(0)

  fun hasSendPermission(context: Context): Boolean =
    context.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED

  fun manager(context: Context, subscriptionId: Int = -1): SmsManager {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val base = context.getSystemService(SmsManager::class.java)
      if (subscriptionId >= 0) base.createForSubscriptionId(subscriptionId) else base
    } else {
      @Suppress("DEPRECATION")
      if (subscriptionId >= 0) SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
      else SmsManager.getDefault()
    }
  }

  /** Used for automatic keyword replies from the receiver; no delivery tracking. */
  fun sendQuietly(context: Context, to: String, body: String, subscriptionId: Int = -1) {
    if (!hasSendPermission(context)) return
    try {
      val m = manager(context.applicationContext, subscriptionId)
      val parts = m.divideMessage(body)
      if (parts.size > 1) m.sendMultipartTextMessage(to, null, parts, null, null)
      else m.sendTextMessage(to, null, body, null, null)
    } catch (e: Exception) {
      // Auto-replies are best effort.
    }
  }

  /**
   * Sends one text and calls back once the carrier has accepted (or rejected) every part.
   * onDone receives null on success, or an error description.
   */
  fun sendTracked(context: Context, to: String, body: String, onDone: (parts: Int, error: String?) -> Unit) {
    val app = context.applicationContext
    val m = manager(app)
    val parts = m.divideMessage(body)
    val id = counter.incrementAndGet()
    val action = "$SENT_ACTION.$id"
    val remaining = AtomicInteger(parts.size)
    val firstError = AtomicReference<String?>(null)
    val finished = AtomicBoolean(false)
    val handler = Handler(Looper.getMainLooper())

    lateinit var receiver: BroadcastReceiver
    lateinit var timeout: Runnable

    fun finish(error: String?) {
      if (!finished.compareAndSet(false, true)) return
      handler.removeCallbacks(timeout)
      try { app.unregisterReceiver(receiver) } catch (e: Exception) { }
      onDone(parts.size, error)
    }

    receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        if (resultCode != Activity.RESULT_OK) firstError.compareAndSet(null, describe(resultCode))
        if (remaining.decrementAndGet() <= 0) finish(firstError.get())
      }
    }
    timeout = Runnable { finish("Timed out waiting for the carrier to accept the message") }

    val filter = IntentFilter(action)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      app.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      app.registerReceiver(receiver, filter)
    }

    val sentIntents = ArrayList<PendingIntent>()
    for (i in parts.indices) {
      val intent = Intent(action).setPackage(app.packageName)
      sentIntents.add(
        PendingIntent.getBroadcast(app, i, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT)
      )
    }

    try {
      handler.postDelayed(timeout, TIMEOUT_MS)
      if (parts.size > 1) m.sendMultipartTextMessage(to, null, parts, sentIntents, null)
      else m.sendTextMessage(to, null, body, sentIntents[0], null)
    } catch (e: Exception) {
      finish(e.message ?: "The phone refused to send the message")
    }
  }

  private fun describe(code: Int): String = when (code) {
    SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Carrier rejected the message (generic failure)"
    SmsManager.RESULT_ERROR_NO_SERVICE -> "No cellular service"
    SmsManager.RESULT_ERROR_NULL_PDU -> "Message could not be encoded"
    SmsManager.RESULT_ERROR_RADIO_OFF -> "Cellular radio is off (airplane mode?)"
    else -> "Send failed (code $code)"
  }
}

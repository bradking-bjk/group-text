package expo.modules.smsgateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SubscriptionManager
import org.json.JSONObject
import java.util.UUID

/**
 * Runs for every incoming text, even when the app is closed. Keyword replies are sent
 * immediately; every message is queued so the app can import it into its database.
 * The phone's normal Messages app still receives the texts as usual.
 */
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    if (messages.isEmpty()) return

    val store = GatewayStore(context)
    val config = store.config()
    val cc = store.defaultCountryCode()
    val autoReply = config.optBoolean("autoReply", true)
    val subscriptionId = subscriptionIdFrom(intent)

    // A long text arrives as several parts; stitch them back together per sender.
    val bodies = LinkedHashMap<String, StringBuilder>()
    var timestamp = System.currentTimeMillis()
    for (m in messages) {
      val from = m.displayOriginatingAddress ?: m.originatingAddress ?: continue
      bodies.getOrPut(from) { StringBuilder() }.append(m.displayMessageBody ?: m.messageBody ?: "")
      if (m.timestampMillis > 0) timestamp = m.timestampMillis
    }

    for ((rawFrom, sb) in bodies) {
      val from = Phone.normalize(rawFrom, cc)
      val body = sb.toString()
      val result = Keywords.evaluate(store, config, from, body)

      if (autoReply && result.reply != null) {
        SmsSender.sendQuietly(context, from, result.reply, subscriptionId)
      }

      val item = JSONObject()
        .put("id", UUID.randomUUID().toString())
        .put("from", from)
        .put("body", body)
        .put("timestamp", timestamp.toDouble())
        .put("kind", result.kind)
        .put("groupCode", result.groupCode ?: JSONObject.NULL)
        .put("name", result.name ?: JSONObject.NULL)
        .put("autoReply", if (autoReply && result.reply != null) result.reply else JSONObject.NULL)
      store.enqueue(item)
    }

    SmsGatewayModule.notifyInbox()
  }

  private fun subscriptionIdFrom(intent: Intent): Int {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val id = intent.getIntExtra(SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX, -1)
      if (id >= 0) return id
    }
    return intent.getIntExtra("subscription", -1)
  }
}

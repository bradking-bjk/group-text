package expo.modules.smsgateway

import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.lang.ref.WeakReference

class SmsGatewayModule : Module() {
  companion object {
    @Volatile private var active: WeakReference<SmsGatewayModule>? = null

    /** Called by SmsReceiver so a running app imports new texts right away. */
    fun notifyInbox() {
      val module = active?.get() ?: return
      try {
        module.sendEvent("onInbox", mapOf("at" to System.currentTimeMillis().toDouble()))
      } catch (e: Exception) {
        // App not ready yet; it will pick up the queue on next launch.
      }
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val store: GatewayStore
    get() = GatewayStore(context)

  override fun definition() = ModuleDefinition {
    Name("SmsGateway")

    Events("onInbox")

    OnCreate { active = WeakReference(this@SmsGatewayModule) }
    OnDestroy { if (active?.get() === this@SmsGatewayModule) active = null }

    Function("isSupported") {
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
    }

    AsyncFunction("setConfig") { config: Map<String, Any?> ->
      store.setConfig(JSONObject(config))
    }

    AsyncFunction("setOptOuts") { numbers: List<String> ->
      store.setOptOuts(numbers)
    }

    AsyncFunction("getOptOuts") {
      store.optOuts().toList()
    }

    AsyncFunction("peekInbox") {
      store.peek()
    }

    AsyncFunction("ackInbox") { ids: List<String> ->
      store.ack(ids)
    }

    AsyncFunction("sendSms") { to: String, body: String, promise: Promise ->
      val ctx = context
      val s = GatewayStore(ctx)
      val number = Phone.normalize(to, s.defaultCountryCode())
      when {
        !SmsSender.hasSendPermission(ctx) ->
          promise.reject("E_PERMISSION", "SMS permission has not been granted", null)
        s.isOptedOut(number) ->
          promise.reject("E_OPTED_OUT", "$number has opted out (texted STOP)", null)
        body.isBlank() ->
          promise.reject("E_EMPTY", "Message is empty", null)
        else -> SmsSender.sendTracked(ctx, number, body) { parts, error ->
          if (error == null) promise.resolve(mapOf("to" to number, "parts" to parts))
          else promise.reject("E_SEND_FAILED", error, null)
        }
      }
    }
  }
}

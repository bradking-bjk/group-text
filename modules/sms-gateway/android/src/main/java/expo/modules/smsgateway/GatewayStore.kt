package expo.modules.smsgateway

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Small persistent store shared by the module (called from JS) and the SMS receiver
 * (which can run while the app is closed). Holds:
 *  - config pushed from JS (org name, groups/codes, auto-reply templates)
 *  - the opt-out list (numbers that texted STOP), used as a hard send guard
 *  - an inbox queue of received texts waiting for the JS side to import
 */
class GatewayStore(context: Context) {
  private val prefs = context.applicationContext
    .getSharedPreferences("sms_gateway", Context.MODE_PRIVATE)

  companion object {
    private val lock = Any()
    private const val MAX_QUEUE = 2000
    private const val KEY_CONFIG = "config"
    private const val KEY_OPT_OUTS = "optOuts"
    private const val KEY_INBOX = "inbox"
  }

  fun config(): JSONObject = try {
    JSONObject(prefs.getString(KEY_CONFIG, "{}") ?: "{}")
  } catch (e: Exception) {
    JSONObject()
  }

  fun setConfig(config: JSONObject) {
    prefs.edit().putString(KEY_CONFIG, config.toString()).apply()
  }

  fun defaultCountryCode(): String =
    config().optString("defaultCountryCode", "1").filter { it.isDigit() }.ifEmpty { "1" }

  fun optOuts(): Set<String> = synchronized(lock) {
    HashSet(prefs.getStringSet(KEY_OPT_OUTS, emptySet()) ?: emptySet())
  }

  fun isOptedOut(number: String): Boolean = optOuts().contains(number)

  fun setOptOuts(numbers: Collection<String>) = synchronized(lock) {
    prefs.edit().putStringSet(KEY_OPT_OUTS, HashSet(numbers)).commit()
  }

  fun addOptOut(number: String) = synchronized(lock) {
    val set = optOuts().toMutableSet()
    set.add(number)
    prefs.edit().putStringSet(KEY_OPT_OUTS, set).commit()
  }

  fun removeOptOut(number: String) = synchronized(lock) {
    val set = optOuts().toMutableSet()
    set.remove(number)
    prefs.edit().putStringSet(KEY_OPT_OUTS, set).commit()
  }

  private fun readQueue(): JSONArray = try {
    JSONArray(prefs.getString(KEY_INBOX, "[]") ?: "[]")
  } catch (e: Exception) {
    JSONArray()
  }

  /** Adds a received message to the queue. Returns the number of queued items. */
  fun enqueue(item: JSONObject): Int = synchronized(lock) {
    val queue = readQueue()
    queue.put(item)
    val kept = if (queue.length() > MAX_QUEUE) {
      JSONArray().also { out ->
        for (i in (queue.length() - MAX_QUEUE) until queue.length()) out.put(queue.get(i))
      }
    } else queue
    prefs.edit().putString(KEY_INBOX, kept.toString()).commit()
    kept.length()
  }

  /** Returns queued items without removing them; JS acknowledges after saving them. */
  fun peek(): List<Map<String, Any?>> = synchronized(lock) {
    val queue = readQueue()
    (0 until queue.length()).map { toMap(queue.getJSONObject(it)) }
  }

  fun ack(ids: Collection<String>) = synchronized(lock) {
    val remove = ids.toHashSet()
    val queue = readQueue()
    val kept = JSONArray()
    for (i in 0 until queue.length()) {
      val obj = queue.getJSONObject(i)
      if (!remove.contains(obj.optString("id"))) kept.put(obj)
    }
    prefs.edit().putString(KEY_INBOX, kept.toString()).commit()
  }

  private fun toMap(obj: JSONObject): Map<String, Any?> {
    val map = HashMap<String, Any?>()
    val keys = obj.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val value = obj.get(key)
      map[key] = when (value) {
        JSONObject.NULL -> null
        is Number -> value.toDouble() // JS numbers are doubles; avoids Long conversion issues
        else -> value
      }
    }
    return map
  }
}

package expo.modules.smsgateway

import org.json.JSONObject

/**
 * Handles the standard texting keywords so members can manage themselves without an app:
 *   JOIN [code] [your name]  -> join a group
 *   STOP (and synonyms)      -> opt out of everything
 *   START / UNSTOP           -> opt back in
 *   HELP / INFO              -> who is texting them and how to stop
 * STOP/START/HELP only count when they are the whole message, so a reply like
 * "stop by the clubhouse at 5" is treated as a normal message.
 */
object Keywords {
  data class Result(
    val kind: String, // message | join | join_failed | stop | start | help
    val groupCode: String? = null,
    val name: String? = null,
    val reply: String? = null,
  )

  private val STOP = setOf("STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE")
  private val START = setOf("START", "UNSTOP", "SUBSCRIBE")
  private val HELP = setOf("HELP", "INFO")

  private const val DEFAULT_JOIN = "You've joined {group} with {org}. Reply STOP to opt out, HELP for help."
  private const val DEFAULT_STOP = "You've been unsubscribed from {org} texts and won't receive more. Reply START to rejoin."
  private const val DEFAULT_START = "You're resubscribed to {org} texts. Reply STOP to opt out."
  private const val DEFAULT_HELP = "{org} group texts. Contact the organizer with questions. Reply STOP to opt out."

  fun evaluate(store: GatewayStore, config: JSONObject, from: String, body: String): Result {
    val words = body.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val first = words.firstOrNull()?.uppercase()?.trim('.', '!', ',', '?') ?: return Result("message")
    val org = config.optString("orgName", "").ifBlank { "our group" }
    val single = words.size == 1
    val joinKeyword = config.optString("joinKeyword", "JOIN").uppercase().ifBlank { "JOIN" }

    fun template(key: String, fallback: String, group: String = "") =
      config.optString(key, "").ifBlank { fallback }.replace("{org}", org).replace("{group}", group)

    if (single && first in STOP) {
      store.addOptOut(from)
      return Result("stop", reply = template("stopReply", DEFAULT_STOP))
    }
    if (single && first in START) {
      store.removeOptOut(from)
      return Result("start", reply = template("startReply", DEFAULT_START))
    }
    if (single && first in HELP) {
      return Result("help", reply = template("helpReply", DEFAULT_HELP))
    }
    if (first == joinKeyword) {
      val groups = config.optJSONArray("groups")
      val count = groups?.length() ?: 0
      var code: String? = null
      var groupName: String? = null
      var nameWords = emptyList<String>()

      if (words.size >= 2 && groups != null) {
        val wanted = words[1].uppercase()
        for (i in 0 until count) {
          val g = groups.getJSONObject(i)
          if (g.optString("code").uppercase() == wanted) {
            code = g.optString("code"); groupName = g.optString("name"); nameWords = words.drop(2)
          }
        }
      }
      if (code == null && count == 1 && groups != null) {
        // Only one group: "JOIN" or "JOIN Jane Doe" both work.
        val g = groups.getJSONObject(0)
        code = g.optString("code"); groupName = g.optString("name"); nameWords = words.drop(1)
      }
      if (code == null) {
        val reply = if (count == 0) "$org isn't accepting text sign-ups right now."
        else "Sorry, we couldn't find that group. Text $joinKeyword followed by the group code your organizer gave you."
        return Result("join_failed", reply = reply)
      }
      store.removeOptOut(from) // texting JOIN is a fresh opt-in
      val name = nameWords.joinToString(" ").take(60).ifBlank { null }
      return Result("join", groupCode = code, name = name, reply = template("joinReply", DEFAULT_JOIN, groupName ?: code))
    }
    return Result("message")
  }
}

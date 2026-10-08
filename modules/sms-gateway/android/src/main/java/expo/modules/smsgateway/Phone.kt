package expo.modules.smsgateway

/**
 * Normalizes phone numbers to a +<country><number> form so the same person always
 * maps to the same key. Keep this in sync with src/lib/phone.ts.
 */
object Phone {
  fun normalize(raw: String, defaultCountryCode: String = "1"): String {
    val trimmed = raw.trim()
    val digits = trimmed.filter { it.isDigit() }
    if (digits.isEmpty()) return trimmed
    val cc = defaultCountryCode.filter { it.isDigit() }.ifEmpty { "1" }
    return when {
      trimmed.startsWith("+") -> "+$digits"
      digits.startsWith("00") -> "+" + digits.drop(2)
      cc == "1" && digits.length == 11 && digits.startsWith("1") -> "+$digits"
      digits.length <= 6 -> digits // short codes stay as-is
      digits.startsWith("0") -> "+$cc" + digits.drop(1)
      digits.length <= 10 -> "+$cc$digits"
      else -> "+$digits"
    }
  }
}
